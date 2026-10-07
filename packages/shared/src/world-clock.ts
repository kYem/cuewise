import type { WorldClockZone } from './types';
import { generateId } from './utils';

export const MAX_WORLD_CLOCKS = 4;
export const MAX_WORLD_CLOCK_LABEL = 24;

const MIN_ZONE_QUERY_LENGTH = 2;
const MAX_ZONE_MATCHES = 6;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ZoneClock {
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
  dateKey: string; // YYYY-MM-DD in that zone
  offsetMinutes: number; // from UTC, at the instant read
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  if (!formatters.has(timeZone)) {
    try {
      formatters.set(
        timeZone,
        new Intl.DateTimeFormat('en-US', {
          timeZone,
          hourCycle: 'h23',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          weekday: 'short',
        })
      );
    } catch {
      formatters.set(timeZone, null);
    }
  }
  return formatters.get(timeZone) ?? null;
}

export function readZoneClock(instant: Date, timeZone: string): ZoneClock | null {
  const formatter = formatterFor(timeZone);
  if (formatter === null) {
    return null;
  }
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // Some engines still say "24" at midnight despite h23.
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const instantMinute = Math.floor(instant.getTime() / 60_000) * 60_000;
  return {
    hour,
    minute,
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ''),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    offsetMinutes: Math.round((wallAsUtc - instantMinute) / 60_000),
  };
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function formatZoneDifference(zone: ZoneClock, home: ZoneClock): string {
  const diff = zone.offsetMinutes - home.offsetMinutes;
  if (diff === 0) {
    return 'Same time';
  }
  const sign = diff > 0 ? '+' : '−';
  const absolute = Math.abs(diff);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  if (minutes === 0) {
    return `${sign}${hours}h`;
  }
  return `${sign}${hours}h ${minutes}m`;
}

const DAY_MS = 86_400_000;

// Kiritimati (+14) and Pago Pago (−11) are 25h apart, so two calendar days is reachable.
export function zoneDayShift(zone: ZoneClock, home: ZoneClock): string | null {
  const days = Math.round((Date.parse(zone.dateKey) - Date.parse(home.dateKey)) / DAY_MS);
  if (days === 0) {
    return null;
  }
  if (days === 1) {
    return 'Tomorrow';
  }
  if (days === -1) {
    return 'Yesterday';
  }
  return `${days > 0 ? '+' : '−'}${Math.abs(days)} days`;
}

export function isZoneDaytime(zone: ZoneClock): boolean {
  return zone.hour >= 7 && zone.hour < 19;
}

export function isZoneWorkingHours(zone: ZoneClock): boolean {
  const weekday = zone.weekday >= 1 && zone.weekday <= 5;
  return weekday && zone.hour >= 9 && zone.hour < 17;
}

// Chrome's zone list and resolvedOptions still report these by their old ids. The id stays as
// the engine gives it (an older engine may not know the new one); only the shown name changes.
const RENAMED_ZONES: Readonly<Record<string, string>> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Godthab': 'America/Nuuk',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Enderbury': 'Pacific/Kanton',
};

const CITY_NAMES: Readonly<Record<string, string>> = {
  'Asia/Ho_Chi_Minh': 'Ho Chi Minh City',
};

function currentTimeZoneId(timeZone: string): string {
  return RENAMED_ZONES[timeZone] ?? timeZone;
}

function lastSegment(timeZone: string): string {
  const segments = timeZone.split('/');
  return (segments[segments.length - 1] ?? timeZone).replace(/_/g, ' ');
}

export function cityFromTimeZone(timeZone: string): string {
  const current = currentTimeZoneId(timeZone);
  return CITY_NAMES[current] ?? lastSegment(current);
}

export function sameTimeZone(a: string, b: string): boolean {
  return currentTimeZoneId(a) === currentTimeZoneId(b);
}

export interface TimeZoneMatch {
  timezone: string;
  city: string;
  region: string;
}

export function engineTimeZones(): readonly string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

/** Offline city search over IANA zone names, so adding a big city works without the network. */
export function searchTimeZones(
  query: string,
  zones: readonly string[] = engineTimeZones()
): TimeZoneMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_ZONE_QUERY_LENGTH) {
    return [];
  }
  const prefix: TimeZoneMatch[] = [];
  const substring: TimeZoneMatch[] = [];
  for (const timezone of zones) {
    if (!timezone.includes('/') || timezone.startsWith('Etc/')) {
      continue;
    }
    const city = cityFromTimeZone(timezone);
    const names = [city.toLowerCase(), lastSegment(timezone).toLowerCase()];
    const match = { timezone, city, region: timezone.split('/')[0] ?? '' };
    if (names.some((name) => name.startsWith(needle))) {
      prefix.push(match);
    } else if (names.some((name) => name.includes(needle))) {
      substring.push(match);
    }
  }
  return [...prefix, ...substring].slice(0, MAX_ZONE_MATCHES);
}

function cleanLabel(label: string, timezone: string): string {
  const trimmed = label.trim().slice(0, MAX_WORLD_CLOCK_LABEL);
  if (trimmed === '') {
    return cityFromTimeZone(timezone);
  }
  return trimmed;
}

/** Edits enforce the caps, but a synced list from another build or device may not have. */
export function shownWorldClocks(zones: WorldClockZone[]): WorldClockZone[] {
  const fits = (zone: WorldClockZone) => zone.label.length <= MAX_WORLD_CLOCK_LABEL;
  if (zones.length <= MAX_WORLD_CLOCKS && zones.every(fits)) {
    return zones;
  }
  return zones.slice(0, MAX_WORLD_CLOCKS).map((zone) => {
    if (fits(zone)) {
      return zone;
    }
    return { ...zone, label: zone.label.slice(0, MAX_WORLD_CLOCK_LABEL) };
  });
}

export function addWorldClock(
  zones: WorldClockZone[],
  pick: { label: string; timezone: string }
): WorldClockZone[] {
  if (zones.length >= MAX_WORLD_CLOCKS) {
    return zones;
  }
  const label = cleanLabel(pick.label, pick.timezone);
  const duplicate = zones.some((zone) => zone.timezone === pick.timezone && zone.label === label);
  if (duplicate) {
    return zones;
  }
  return [...zones, { id: generateId(), label, timezone: pick.timezone }];
}

export function removeWorldClock(zones: WorldClockZone[], id: string): WorldClockZone[] {
  return zones.filter((zone) => zone.id !== id);
}

export function moveWorldClockUp(zones: WorldClockZone[], id: string): WorldClockZone[] {
  const index = zones.findIndex((zone) => zone.id === id);
  if (index <= 0) {
    return zones;
  }
  const next = [...zones];
  const [moved] = next.splice(index, 1);
  if (moved === undefined) {
    return zones;
  }
  next.splice(index - 1, 0, moved);
  return next;
}

export function renameWorldClock(
  zones: WorldClockZone[],
  id: string,
  label: string
): WorldClockZone[] {
  return zones.map((zone) => {
    if (zone.id !== id) {
      return zone;
    }
    return { ...zone, label: cleanLabel(label, zone.timezone) };
  });
}
