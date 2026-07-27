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
 * whole new tab down. One row per field, because a table that only covers a few of them lets
 * the rest widen to `unknown` unnoticed — which is exactly what happened here.
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

  // One field wrong per row, everything else valid. An earlier version of the first row
  // dropped `condition` and `isDay` as well, so it was rejected for the missing fields and
  // `temperature` could be widened to `unknown` with this file green.
  const hour = (overrides: Record<string, unknown>) => ({
    hours: [{ ...SNAPSHOT.hours[0], ...overrides }],
  });
  const current = (overrides: Record<string, unknown>) => ({
    current: { ...SNAPSHOT.current, ...overrides },
  });
  const place = (overrides: Record<string, unknown>) => ({ location: { ...LONDON, ...overrides } });

  it.each([
    ['a non-numeric hour temperature', hour({ temperature: 'warm' })],
    ['an unrecognised hour condition', hour({ condition: 'sharknado' })],
    ['a non-string hour time', hour({ time: 1_800_000_000 })],
    ['a non-boolean hour isDay', hour({ isDay: 'yes' })],
    ['an unrecognised units value', { units: 'kelvin' }],
    ['a non-string forecast timezone', { timezone: 42 }],
    // Both are rendered in the chip, and the predicate this replaced checked them by hand.
    ['a non-numeric high', { high: 'hot' }],
    ['a non-numeric low', { low: null }],
    ['an unrecognised current condition', current({ condition: 'x' })],
    ['a non-boolean current isDay', current({ isDay: 1 })],
    [
      'a NaN temperature, which every later comparison silently fails',
      current({
        temperature: Number.NaN,
      }),
    ],
    ['a location that fails its own schema', place({ timezone: '' })],
    ['a non-string location id', place({ id: 2643743 })],
    ['a non-string location name', place({ name: null })],
    ['a non-string location country', place({ country: 7 })],
    ['a non-string location countryCode', place({ countryCode: false })],
    ['a non-numeric longitude', place({ longitude: '-0.1278' })],
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
