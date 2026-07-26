import { describe, expect, it } from 'vitest';
import { weatherLocationSchema } from './weather';

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
