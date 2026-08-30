import { describe, expect, it } from 'vitest';
import type { WeatherHour } from './types';
import {
  formatForecastHour,
  formatTemperature,
  formatWeatherAge,
  MAX_FORECAST_HOURS,
  mapWmoCode,
  resolveDayRange,
  resolveWeatherUnits,
  sampleForecastHours,
  toLocalIso,
  weatherAgeMs,
} from './weather-utils';

/** A whole local day of hours, 00:00–23:00, so sampling can be exercised at any point in it. */
function dayOfHours(date = '2026-07-25'): WeatherHour[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    temperature: 10 + hour,
    condition: 'clear' as const,
    isDay: hour >= 6 && hour < 21,
  }));
}

function twoDaysOfHours(): WeatherHour[] {
  return [...dayOfHours('2026-07-25'), ...dayOfHours('2026-07-26')];
}

describe('mapWmoCode', () => {
  it('maps documented codes to their condition bucket', () => {
    expect(mapWmoCode(0)).toBe('clear');
    expect(mapWmoCode(2)).toBe('partly-cloudy');
    expect(mapWmoCode(3)).toBe('cloudy');
    expect(mapWmoCode(45)).toBe('fog');
    expect(mapWmoCode(53)).toBe('drizzle');
    expect(mapWmoCode(65)).toBe('rain');
    expect(mapWmoCode(75)).toBe('snow');
    expect(mapWmoCode(95)).toBe('thunderstorm');
  });

  it('maps rain and snow showers onto their base condition', () => {
    expect(mapWmoCode(82)).toBe('rain');
    expect(mapWmoCode(86)).toBe('snow');
  });

  it('falls back to unknown for unrecognised or non-numeric codes', () => {
    expect(mapWmoCode(4)).toBe('unknown');
    expect(mapWmoCode(999)).toBe('unknown');
    expect(mapWmoCode(Number.NaN)).toBe('unknown');
    expect(mapWmoCode(undefined)).toBe('unknown');
    expect(mapWmoCode('61')).toBe('unknown');
  });
});

describe('resolveWeatherUnits', () => {
  it('passes an explicit preference through untouched', () => {
    expect(resolveWeatherUnits('metric', 'en-US')).toBe('metric');
    expect(resolveWeatherUnits('imperial', 'en-GB')).toBe('imperial');
  });

  it('resolves auto to imperial only in the regions that use Fahrenheit', () => {
    expect(resolveWeatherUnits('auto', 'en-US')).toBe('imperial');
    expect(resolveWeatherUnits('auto', 'en-LR')).toBe('imperial');
    expect(resolveWeatherUnits('auto', 'my-MM')).toBe('imperial');
  });

  it('resolves auto to metric elsewhere', () => {
    expect(resolveWeatherUnits('auto', 'en-GB')).toBe('metric');
    expect(resolveWeatherUnits('auto', 'lt-LT')).toBe('metric');
    expect(resolveWeatherUnits('auto', 'de-DE')).toBe('metric');
  });

  it('falls back to metric for a malformed locale rather than assuming a region', () => {
    expect(resolveWeatherUnits('auto', '!!!')).toBe('metric');
    expect(resolveWeatherUnits('auto', '')).toBe('metric');
  });

  it('infers the region from a language-only tag via maximize', () => {
    expect(resolveWeatherUnits('auto', 'en')).toBe('imperial');
  });
});

describe('sampleForecastHours', () => {
  it('returns at most the requested count', () => {
    const picked = sampleForecastHours(dayOfHours(), '2026-07-25T06:30');
    expect(picked).toHaveLength(MAX_FORECAST_HOURS);
  });

  it('only returns hours strictly after now', () => {
    const picked = sampleForecastHours(dayOfHours(), '2026-07-25T06:00');
    expect(picked.every((hour) => hour.time > '2026-07-25T06:00')).toBe(true);
  });

  it('reaches the far end of the window so the sample spans it', () => {
    const picked = sampleForecastHours(twoDaysOfHours(), '2026-07-25T06:30');
    expect(picked[picked.length - 1].time).toBe('2026-07-25T18:00');
  });

  it('crosses midnight rather than emptying out at the end of the day', () => {
    const picked = sampleForecastHours(twoDaysOfHours(), '2026-07-25T23:30');
    expect(picked.map((hour) => hour.time)).toEqual([
      '2026-07-26T00:00',
      '2026-07-26T03:00',
      '2026-07-26T06:00',
      '2026-07-26T08:00',
      '2026-07-26T11:00',
    ]);
  });

  it('stays full through the evening, spanning both days', () => {
    const picked = sampleForecastHours(twoDaysOfHours(), '2026-07-25T22:00');
    expect(picked.map((hour) => hour.time)).toEqual([
      '2026-07-25T23:00',
      '2026-07-26T02:00',
      '2026-07-26T05:00',
      '2026-07-26T07:00',
      '2026-07-26T10:00',
    ]);
  });

  it('spreads the sample evenly rather than clustering near now', () => {
    const picked = sampleForecastHours(twoDaysOfHours(), '2026-07-25T00:30');
    expect(picked.map((hour) => hour.time)).toEqual([
      '2026-07-25T01:00',
      '2026-07-25T04:00',
      '2026-07-25T07:00',
      '2026-07-25T09:00',
      '2026-07-25T12:00',
    ]);
  });

  it('returns fewer than the maximum when the payload stops at the end of today', () => {
    const picked = sampleForecastHours(dayOfHours(), '2026-07-25T22:00');
    expect(picked.map((hour) => hour.time)).toEqual(['2026-07-25T23:00']);
  });

  it('returns nothing once the final hour has passed', () => {
    expect(sampleForecastHours(dayOfHours(), '2026-07-25T23:30')).toEqual([]);
  });

  it('returns nothing for an empty day', () => {
    expect(sampleForecastHours([], '2026-07-25T06:00')).toEqual([]);
  });

  it('never returns duplicates when the remaining hours barely exceed the maximum', () => {
    const picked = sampleForecastHours(dayOfHours(), '2026-07-25T17:30');
    const times = picked.map((hour) => hour.time);
    expect(new Set(times).size).toBe(times.length);
  });

  it('returns a single real hour when asked for one', () => {
    const picked = sampleForecastHours(dayOfHours(), '2026-07-25T06:00', 1);
    expect(picked).toHaveLength(1);
    expect(picked[0]).toBeDefined();
  });

  it('returns nothing when asked for a non-positive count', () => {
    expect(sampleForecastHours(dayOfHours(), '2026-07-25T06:00', 0)).toEqual([]);
  });
});

describe('toLocalIso', () => {
  it('renders an instant in the requested zone, matching the provider hourly format', () => {
    const instant = new Date('2026-07-25T12:30:00Z');
    expect(toLocalIso(instant, 'UTC')).toBe('2026-07-25T12:30');
    expect(toLocalIso(instant, 'Europe/Vilnius')).toBe('2026-07-25T15:30');
    expect(toLocalIso(instant, 'America/New_York')).toBe('2026-07-25T08:30');
  });

  it('rolls the date when the zone pushes the instant across midnight', () => {
    const instant = new Date('2026-07-25T23:30:00Z');
    expect(toLocalIso(instant, 'Asia/Tokyo')).toBe('2026-07-26T08:30');
  });

  it('normalises a midnight hour to 00 so string ordering stays chronological', () => {
    const instant = new Date('2026-07-25T00:15:00Z');
    expect(toLocalIso(instant, 'UTC')).toBe('2026-07-25T00:15');
  });

  // An unknown zone used to throw during render, taking the whole new tab down with it.
  it('degrades to UTC rather than throwing on a zone this engine does not know', () => {
    const instant = new Date('2026-07-25T12:30:00Z');
    expect(() => toLocalIso(instant, 'Mars/Olympus_Mons')).not.toThrow();
    expect(toLocalIso(instant, 'Mars/Olympus_Mons')).toBe('2026-07-25T12:30');
  });

  it('produces a value directly comparable with provider hour stamps', () => {
    const now = toLocalIso(new Date('2026-07-25T05:30:00Z'), 'UTC');
    const picked = sampleForecastHours(dayOfHours(), now);
    expect(picked[0].time).toBe('2026-07-25T06:00');
  });
});

describe('formatTemperature', () => {
  it('rounds to a whole degree', () => {
    expect(formatTemperature(17.4)).toBe('17°');
    expect(formatTemperature(17.6)).toBe('18°');
    expect(formatTemperature(-3.5)).toBe('-3°');
  });

  it('renders a near-zero negative as 0, not -0', () => {
    expect(formatTemperature(-0.4)).toBe('0°');
  });

  it('renders a dash for a non-finite reading rather than NaN', () => {
    expect(formatTemperature(Number.NaN)).toBe('—');
    expect(formatTemperature(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatWeatherAge', () => {
  const now = new Date('2026-07-25T12:00:00Z');
  const at = (iso: string): string | null => formatWeatherAge(iso, now);

  it('returns null when there is no reading yet', () => {
    expect(formatWeatherAge(null, now)).toBeNull();
  });

  it('says the time is unknown for an unparseable timestamp rather than showing NaN', () => {
    expect(formatWeatherAge('not a date', now)).toBe('Updated at an unknown time');
  });

  it('reports a fresh reading as just now', () => {
    expect(at('2026-07-25T11:59:30Z')).toBe('Updated just now');
  });

  it('reports minutes', () => {
    expect(at('2026-07-25T11:52:00Z')).toBe('Updated 8 min ago');
  });

  it('reports hours past the hour mark', () => {
    expect(at('2026-07-25T09:00:00Z')).toBe('Updated 3 h ago');
  });

  it('reports days past a day', () => {
    expect(at('2026-07-23T12:00:00Z')).toBe('Updated 2 days ago');
    expect(at('2026-07-24T12:00:00Z')).toBe('Updated yesterday');
  });

  it('treats a stamp a few seconds ahead as just now', () => {
    expect(at('2026-07-25T12:00:30Z')).toBe('Updated just now');
  });

  it('admits the age is unknown for a stamp far enough ahead to mean the clock stepped back', () => {
    expect(at('2026-07-25T12:30:00Z')).toBe('Updated at an unknown time');
  });
});

describe('weatherAgeMs', () => {
  const now = new Date('2026-07-25T12:00:00Z');

  it('measures the age of a past reading', () => {
    expect(weatherAgeMs('2026-07-25T11:30:00Z', now)).toBe(30 * 60_000);
  });

  it.each([
    ['no reading yet', null],
    ['an unparseable stamp', 'not a date'],
    ['a stamp beyond the skew tolerance', '2026-07-25T12:30:00Z'],
  ])('returns null for %s', (_label, lastFetch) => {
    expect(weatherAgeMs(lastFetch, now)).toBeNull();
  });

  it('clamps a stamp within the skew tolerance to zero rather than rejecting it', () => {
    expect(weatherAgeMs('2026-07-25T12:00:30Z', now)).toBe(0);
  });

  // A literal, not the exported constant: importing it would let the tolerance move unnoticed.
  it.each([
    ['at the edge of the tolerance', 60_000, 0],
    ['a millisecond past it', 60_001, null],
  ])('dates a stamp %s', (_label, msAhead, expected) => {
    const ahead = new Date(now.getTime() + msAhead).toISOString();

    expect(weatherAgeMs(ahead, now)).toBe(expected);
  });
});

describe('formatForecastHour', () => {
  it.each([
    ['2026-07-25T00:00', '12 AM'],
    ['2026-07-25T09:00', '9 AM'],
    ['2026-07-25T12:00', '12 PM'],
    ['2026-07-25T15:00', '3 PM'],
    ['2026-07-25T23:00', '11 PM'],
  ])('renders %s as %s on a 12-hour clock', (time, expected) => {
    expect(formatForecastHour(time, '12h')).toBe(expected);
  });

  it('keeps the provider hour as-is on a 24-hour clock', () => {
    expect(formatForecastHour('2026-07-25T15:00', '24h')).toBe('15');
  });

  // The label is decoration on an opt-in chip; a malformed stamp must not throw mid-render,
  // and must not turn into a plausible-looking hour either.
  it.each([
    ['a truncated stamp', '2026-07-25T', ''],
    ['a non-timestamp', 'not-a-timestamp', 'ta'],
    ['an out-of-range hour', '2026-07-25T99:00', '99'],
  ])('passes %s through untouched', (_label, time, expected) => {
    expect(formatForecastHour(time, '12h')).toBe(expected);
  });
});

describe('formatWeatherAge boundaries', () => {
  const now = new Date('2026-07-25T12:00:00.000Z');

  it.each([
    ['exactly an hour', 60, 'Updated 1 h ago'],
    ['a minute under an hour', 59, 'Updated 59 min ago'],
    ['exactly a day', 24 * 60, 'Updated yesterday'],
    ['an hour under a day', 23 * 60, 'Updated 23 h ago'],
  ])('rolls over at %s', (_label, minutesAgo, expected) => {
    const then = new Date(now.getTime() - minutesAgo * 60_000).toISOString();

    expect(formatWeatherAge(then, now)).toBe(expected);
  });
});

// Fall-back days repeat a local hour, and the popover keys its rows on `time`, so a
// duplicate would collide as a React key.
describe('sampleForecastHours across a DST fall-back day', () => {
  it('never returns the same stamp twice, which would collide as React keys', () => {
    const repeated: WeatherHour[] = [
      { time: '2026-11-01T00:00', temperature: 9, condition: 'clear', isDay: false },
      { time: '2026-11-01T01:00', temperature: 8, condition: 'clear', isDay: false },
      { time: '2026-11-01T01:00', temperature: 8, condition: 'clear', isDay: false },
      { time: '2026-11-01T02:00', temperature: 7, condition: 'clear', isDay: false },
    ];

    const picked = sampleForecastHours(repeated, '2026-11-01T00:30', 3);

    expect(new Set(picked.map((hour) => hour.time)).size).toBe(picked.length);
  });
});

describe('resolveDayRange', () => {
  const reading = {
    high: 21,
    low: 11,
    tomorrow: { high: 26, low: 14 },
    hours: twoDaysOfHours(),
  };

  it("keeps today's range while hours of today are still ahead", () => {
    expect(resolveDayRange(reading, '2026-07-25T22:30')).toEqual({
      high: 21,
      low: 11,
      isTomorrow: false,
    });
  });

  it("switches to tomorrow's once none are", () => {
    expect(resolveDayRange(reading, '2026-07-25T23:30')).toEqual({
      high: 26,
      low: 14,
      isTomorrow: true,
    });
  });

  // A tab left open across midnight: the reading's second day is the day it is now.
  it('drops the label once midnight has passed since the reading', () => {
    expect(resolveDayRange(reading, '2026-07-26T00:10')).toEqual({
      high: 26,
      low: 14,
      isTomorrow: false,
    });
  });

  // A pinned tab or a suspended laptop: nothing refetches on its own, so the reading can
  // outlive both the days it describes.
  it('keeps to the reading when now is past every day it covers', () => {
    expect(resolveDayRange(reading, '2026-07-29T10:00')).toEqual({
      high: 21,
      low: 11,
      isTomorrow: false,
    });
  });

  it('keeps to the reading when the zone could not be resolved at all', () => {
    expect(resolveDayRange(reading, '')).toEqual({ high: 21, low: 11, isTomorrow: false });
  });

  it("keeps today's when the reading carries no tomorrow", () => {
    const { tomorrow: _absent, ...noTomorrow } = reading;

    expect(resolveDayRange(noTomorrow, '2026-07-25T23:30')).toEqual({
      high: 21,
      low: 11,
      isTomorrow: false,
    });
  });

  it("keeps today's when the reading has no hours to place the day by", () => {
    expect(resolveDayRange({ ...reading, hours: [] }, '2026-07-25T23:30')).toEqual({
      high: 21,
      low: 11,
      isTomorrow: false,
    });
  });
});
