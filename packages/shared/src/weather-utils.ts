import type {
  WeatherConditionKind,
  WeatherHour,
  WeatherUnits,
  WeatherUnitsPreference,
} from './types';

/** Regions that use Fahrenheit for everyday weather. Everywhere else gets Celsius. */
const IMPERIAL_REGIONS = ['US', 'LR', 'MM'];

/** More needs a scroller, which stops the popover being glanceable. */
export const MAX_FORECAST_HOURS = 5;

/** WMO 4677 codes. Unlisted ones fall through to 'unknown' rather than guessing. */
const WMO_CONDITIONS = new Map<number, WeatherConditionKind>([
  [0, 'clear'],
  [1, 'clear'],
  [2, 'partly-cloudy'],
  [3, 'cloudy'],
  [45, 'fog'],
  [48, 'fog'],
  [51, 'drizzle'],
  [53, 'drizzle'],
  [55, 'drizzle'],
  [56, 'drizzle'],
  [57, 'drizzle'],
  [61, 'rain'],
  [63, 'rain'],
  [65, 'rain'],
  [66, 'rain'],
  [67, 'rain'],
  [71, 'snow'],
  [73, 'snow'],
  [75, 'snow'],
  [77, 'snow'],
  [80, 'rain'],
  [81, 'rain'],
  [82, 'rain'],
  [85, 'snow'],
  [86, 'snow'],
  [95, 'thunderstorm'],
  [96, 'thunderstorm'],
  [99, 'thunderstorm'],
]);

export function mapWmoCode(code: unknown): WeatherConditionKind {
  if (typeof code !== 'number' || !Number.isFinite(code)) {
    return 'unknown';
  }
  return WMO_CONDITIONS.get(code) ?? 'unknown';
}

/**
 * 'auto' reads the region from the resolved locale, falling back to metric when the tag
 * is unparseable rather than assuming a region.
 * @param locale - Override for tests; defaults to the runtime's resolved locale.
 */
export function resolveWeatherUnits(
  preference: WeatherUnitsPreference,
  locale?: string
): WeatherUnits {
  if (preference !== 'auto') {
    return preference;
  }
  const tag = locale ?? resolveRuntimeLocale();
  if (tag === null) {
    return 'metric';
  }
  const region = readRegion(tag);
  if (region === null) {
    return 'metric';
  }
  return IMPERIAL_REGIONS.includes(region) ? 'imperial' : 'metric';
}

function resolveRuntimeLocale(): string | null {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return null;
  }
}

function readRegion(tag: string): string | null {
  try {
    const parsed = new Intl.Locale(tag).maximize();
    return parsed.region ?? null;
  } catch {
    const match = /^[A-Za-z]{2,3}[-_]([A-Za-z]{2})(?:[-_]|$)/.exec(tag);
    if (match === null) {
      return null;
    }
    return match[1].toUpperCase();
  }
}

/**
 * Up to `max` hours from the rest of the day, evenly spread and always including the last
 * so the sample spans to end of day. Returns fewer late in the day, and none once the
 * final hour has passed.
 * @param hours - The location's whole local day, ascending.
 * @param nowLocalIso - "Now" in the *location's* zone, not the device's.
 */
export function sampleForecastHours(
  hours: WeatherHour[],
  nowLocalIso: string,
  max: number = MAX_FORECAST_HOURS
): WeatherHour[] {
  if (max <= 0) {
    return [];
  }
  // Same-zone, same-format stamps, so string order is chronological — no DST traps.
  const remaining = hours.filter((hour) => hour.time > nowLocalIso);
  if (remaining.length <= max) {
    return remaining;
  }
  if (max === 1) {
    return [remaining[remaining.length - 1]];
  }
  const step = (remaining.length - 1) / (max - 1);
  const picked: WeatherHour[] = [];
  for (let i = 0; i < max; i++) {
    picked.push(remaining[Math.round(i * step)]);
  }
  return picked;
}

/** Rounded temperature with a degree sign, e.g. "17°". */
export function formatTemperature(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)}°`;
}

/**
 * How old a reading is, in words. The popover shows this instead of hiding staleness,
 * so a cached reading during an outage still reads as honest.
 */
export function formatWeatherAge(lastFetch: string | null, now: Date = new Date()): string | null {
  if (lastFetch === null) {
    return null;
  }
  const then = Date.parse(lastFetch);
  if (Number.isNaN(then)) {
    return null;
  }
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 1) {
    return 'Updated just now';
  }
  if (minutes < 60) {
    return `Updated ${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Updated ${hours} h ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`;
}

function formatZonedParts(instant: Date, timeZone: string): Intl.DateTimeFormatPart[] | null {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(instant);
  } catch {
    return null;
  }
}

/**
 * "now" in the given IANA zone, in the provider's hourly `time` format
 * (`YYYY-MM-DDTHH:mm`) so the two compare as strings.
 */
export function toLocalIso(instant: Date, timeZone: string): string {
  // A zone this engine's ICU doesn't know throws during render, and the app-wide
  // ErrorBoundary would take the whole new tab down over an opt-in chip. Degrade instead.
  const parts = formatZonedParts(instant, timeZone) ?? formatZonedParts(instant, 'UTC');
  if (parts === null) {
    return '';
  }
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const found = parts.find((part) => part.type === type);
    return found === undefined ? '00' : found.value;
  };
  // hour12:false yields "24" at midnight in some engines, which would sort after every
  // real hour and silently empty the forecast.
  const rawHour = get('hour');
  const hour = rawHour === '24' ? '00' : rawHour;
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}
