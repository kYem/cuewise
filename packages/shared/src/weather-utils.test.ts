import { describe, expect, it } from 'vitest';
import type { WeatherHour } from './types';
import {
  formatTemperature,
  formatWeatherAge,
  MAX_FORECAST_HOURS,
  mapWmoCode,
  resolveWeatherUnits,
  sampleForecastHours,
  toLocalIso,
  weatherUnitSymbol,
} from './weather-utils';

/** A whole local day of hours, 00:00–23:00, so sampling can be exercised at any point in it. */
function dayOfHours(date = '2026-07-25'): WeatherHour[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    temperature: 10 + hour,
    condition: 'clear' as const,
  }));
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

  it('always includes the last hour of the day so the sample spans to the end', () => {
    const picked = sampleForecastHours(dayOfHours(), '2026-07-25T06:30');
    expect(picked[picked.length - 1].time).toBe('2026-07-25T23:00');
  });

  it('spreads the sample evenly rather than clustering near now', () => {
    const picked = sampleForecastHours(dayOfHours(), '2026-07-25T00:30');
    expect(picked.map((hour) => hour.time)).toEqual([
      '2026-07-25T01:00',
      '2026-07-25T07:00',
      '2026-07-25T12:00',
      '2026-07-25T18:00',
      '2026-07-25T23:00',
    ]);
  });

  it('returns fewer than the maximum late in the day', () => {
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

describe('weatherUnitSymbol', () => {
  it('names the unit system', () => {
    expect(weatherUnitSymbol('metric')).toBe('°C');
    expect(weatherUnitSymbol('imperial')).toBe('°F');
  });
});

describe('formatWeatherAge', () => {
  const now = new Date('2026-07-25T12:00:00Z');
  const at = (iso: string): string | null => formatWeatherAge(iso, now);

  it('returns null when there is no reading yet', () => {
    expect(formatWeatherAge(null, now)).toBeNull();
  });

  it('returns null for an unparseable timestamp rather than NaN', () => {
    expect(formatWeatherAge('not a date', now)).toBeNull();
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

  it('treats a future timestamp as just now', () => {
    expect(at('2026-07-25T12:30:00Z')).toBe('Updated just now');
  });
});
