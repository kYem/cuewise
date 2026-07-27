import { describe, expect, it } from 'vitest';
import { weatherLocationSchema, weatherSnapshotSchema } from './weather';

const LONDON = {
  id: '2643743',
  name: 'London',
  admin1: 'England',
  country: 'United Kingdom',
  countryCode: 'GB',
  latitude: 51.5074,
  longitude: -0.1278,
  timezone: 'Europe/London',
};

describe('weatherLocationSchema', () => {
  it('accepts a place the proxy would emit', () => {
    expect(weatherLocationSchema.safeParse(LONDON).success).toBe(true);
  });

  // Every "today" comparison resolves against this zone; an empty one sends toLocalIso
  // down its UTC fallback and filters the forecast by the wrong clock.
  it('rejects an empty timezone rather than defaulting it', () => {
    expect(weatherLocationSchema.safeParse({ ...LONDON, timezone: '' }).success).toBe(false);
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects a %s coordinate, which no arithmetic survives', (_label, value) => {
    expect(weatherLocationSchema.safeParse({ ...LONDON, latitude: value }).success).toBe(false);
  });

  it('keeps admin1 nullable, since the geocoder does not always know a region', () => {
    expect(weatherLocationSchema.safeParse({ ...LONDON, admin1: null }).success).toBe(true);
  });
});

/**
 * These replaced hand-written `isForecast`/`isHour`/`isCurrentConditions` predicates whose own
 * docstring recorded what a bad snapshot cost: it threw inside the chip's render and took the
 * whole new tab down. The location half above was ported with tests; the forecast half was not,
 * and every one of its inner shapes could be widened to `unknown` with the monorepo green.
 */
describe('weatherSnapshotSchema', () => {
  const SNAPSHOT = {
    location: LONDON,
    units: 'metric',
    timezone: 'Europe/London',
    current: { temperature: 12, apparentTemperature: 10, condition: 'cloudy', isDay: true },
    high: 15,
    low: 8,
    hours: [{ time: '2026-07-27T10:00', temperature: 12, condition: 'cloudy', isDay: true }],
  };

  it('accepts a snapshot the proxy would emit', () => {
    expect(weatherSnapshotSchema.safeParse(SNAPSHOT).success).toBe(true);
  });

  it.each([
    ['a malformed hour', { hours: [{ time: '2026-07-27T10:00', temperature: 'warm' }] }],
    [
      'an unrecognised hour condition',
      { hours: [{ ...SNAPSHOT.hours[0], condition: 'sharknado' }] },
    ],
    ['an unrecognised units value', { units: 'kelvin' }],
    ['a location that fails its own schema', { location: { ...LONDON, timezone: '' } }],
    ['an unrecognised current condition', { current: { ...SNAPSHOT.current, condition: 'x' } }],
    [
      'a NaN temperature, which every later comparison silently fails',
      {
        current: { ...SNAPSHOT.current, temperature: Number.NaN },
      },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(weatherSnapshotSchema.safeParse({ ...SNAPSHOT, ...overrides }).success).toBe(false);
  });

  // The forecast tolerates a missing "feels like" — the provider omits it for some places —
  // and narrowing that to a plain number would blank the whole chip for those users.
  it('keeps apparentTemperature nullable', () => {
    const current = { ...SNAPSHOT.current, apparentTemperature: null };
    expect(weatherSnapshotSchema.safeParse({ ...SNAPSHOT, current }).success).toBe(true);
  });
});
