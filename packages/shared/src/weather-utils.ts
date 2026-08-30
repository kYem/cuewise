import type {
  TimeFormat,
  WeatherConditionKind,
  WeatherForecast,
  WeatherHour,
  WeatherUnits,
  WeatherUnitsPreference,
} from './types';

/** Regions that use Fahrenheit for everyday weather. Everywhere else gets Celsius. */
const IMPERIAL_REGIONS = ['US', 'LR', 'MM'];

/** More needs a scroller, which stops the popover being glanceable. */
export const MAX_FORECAST_HOURS = 5;

/** Past this the strip stops answering "what do the next few hours look like". */
export const FORECAST_HORIZON_HOURS = 12;

/** A reading past this age is stale; consumers decide when to act on that. */
export const WEATHER_STALE_MS = 30 * 60 * 1000;

/** Slack for our own clock stepping back a little after a reading was written. */
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

/**
 * How old a reading is, or null once its stamp sits far enough ahead that the clock must have
 * stepped back: the age is then unknowable, so callers refetch rather than assume it is fresh.
 */
export function weatherAgeMs(lastFetch: string | null, now: Date = new Date()): number | null {
  if (lastFetch === null) {
    return null;
  }
  const taken = Date.parse(lastFetch);
  if (Number.isNaN(taken)) {
    return null;
  }
  const age = now.getTime() - taken;
  if (age < -CLOCK_SKEW_TOLERANCE_MS) {
    return null;
  }
  return Math.max(age, 0);
}

/**
 * ~1km. Open-Meteo snaps to its own model grid regardless (51.51,-0.13 returns 51.5,-0.25),
 * so this costs no accuracy. Shared rather than duplicated: the client rounds so precise
 * coordinates never leave the device, and the proxy rounds again so a request arriving by
 * any other path gets the same treatment.
 */
export const WEATHER_COORD_DECIMALS = 2;

export function roundCoordinate(value: number): number {
  const factor = 10 ** WEATHER_COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

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
 * Up to `max` hours from the next `FORECAST_HORIZON_HOURS`, evenly spread and always
 * including the last so the sample spans the window. The window crosses midnight — pinning
 * it to the rest of today emptied the strip out every evening. Returns fewer as the payload
 * runs out — an older single-day proxy, or a reading gone stale.
 * @param hours - The location's local hours, ascending, today and tomorrow.
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
  // Same-zone, same-format stamps, so string order is chronological. The one DST trap is
  // the fall-back day, where the provider repeats a local hour: the popover keys its rows
  // on this stamp, so a duplicate would collide. Keep the first of each.
  const seen = new Set<string>();
  const upcoming = hours.filter((hour) => {
    if (hour.time <= nowLocalIso || seen.has(hour.time)) {
      return false;
    }
    seen.add(hour.time);
    return true;
  });
  // Hourly stamps, so the count is the horizon. Spreading over everything the payload holds
  // would stretch a two-day reading into a two-day strip.
  const remaining = upcoming.slice(0, FORECAST_HORIZON_HOURS);
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

/**
 * Which day the popover's high and low belong to. Today's, until the reading has no hours of
 * today left to show — past that, today's high is history and tomorrow's is what the strip is
 * about. Once the reading's second day is the day it now is, that range is simply today's, so
 * the label comes off. Anything the reading does not cover — no tomorrow, an unresolvable
 * zone, or a reading left standing past both its days — keeps today's, which the popover's
 * age line is there to qualify.
 * @param nowLocalIso - "Now" in the *location's* zone, not the device's.
 */
export function resolveDayRange(
  forecast: Pick<WeatherForecast, 'high' | 'low' | 'tomorrow' | 'hours'>,
  nowLocalIso: string
): { high: number; low: number; isTomorrow: boolean } {
  const today = { high: forecast.high, low: forecast.low, isTomorrow: false };
  const tomorrow = forecast.tomorrow;
  const first = forecast.hours[0];
  if (tomorrow === undefined || first === undefined) {
    return today;
  }
  const firstDate = first.time.slice(0, 10);
  const nowDate = nowLocalIso.slice(0, 10);
  const second = forecast.hours.find((hour) => hour.time.slice(0, 10) > firstDate);
  if (second !== undefined && nowDate === second.time.slice(0, 10)) {
    return { high: tomorrow.high, low: tomorrow.low, isTomorrow: false };
  }
  if (nowDate !== firstDate) {
    return today;
  }
  const moreToday = forecast.hours.some(
    (hour) => hour.time > nowLocalIso && hour.time.slice(0, 10) === nowDate
  );
  if (moreToday) {
    return today;
  }
  return { high: tomorrow.high, low: tomorrow.low, isTomorrow: true };
}

/**
 * Forecast-strip label for a provider stamp ("2026-07-25T15:00"), in the user's clock
 * format — every other time surface reads `settings.timeFormat`, which defaults to 12h.
 * The stamp is already in the location's zone, so this only reformats, never converts.
 */
export function formatForecastHour(time: string, timeFormat: TimeFormat): string {
  const raw = time.slice(11, 13);
  const hour = Number(raw);
  // Length check included: Number('') is 0, so a truncated stamp would print "12 AM".
  if (raw.length !== 2 || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return raw;
  }
  if (timeFormat === '24h') {
    return raw;
  }
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

/** Rounded temperature with a degree sign, e.g. "17°". */
export function formatTemperature(value: number): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)}°`;
}

/**
 * How old a reading is, in words, or null when its stamp cannot be dated. The popover shows it
 * alongside any error, so a datable reading is never passed off as current.
 */
export function formatWeatherAge(lastFetch: string | null, now: Date = new Date()): string | null {
  const age = weatherAgeMs(lastFetch, now);
  if (age === null) {
    return null;
  }
  const minutes = Math.floor(age / 60_000);
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
