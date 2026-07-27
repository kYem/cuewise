import { z } from 'zod/mini';
import type { WeatherForecast, WeatherHour, WeatherLocation, WeatherSnapshot } from '../types';
import { WEATHER_CONDITION_KINDS, WEATHER_UNITS } from '../types';
import { assertNoDrift } from './drift';

// Built straight from the exported const arrays, so these cannot fall behind the unions.
const conditionSchema = z.enum(WEATHER_CONDITION_KINDS);
const unitsSchema = z.enum(WEATHER_UNITS);

export const weatherLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  admin1: z.nullable(z.string()),
  country: z.string(),
  countryCode: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  // Non-empty: every "today" comparison resolves against this zone, and an empty string
  // sends `toLocalIso` down its UTC fallback, quietly filtering the forecast by the wrong
  // clock. The proxy refuses such a place too, so a stored one can only be corruption.
  timezone: z.string().check(z.minLength(1)),
});
assertNoDrift<z.infer<typeof weatherLocationSchema>, WeatherLocation>();

export const weatherHourSchema = z.object({
  time: z.string(),
  temperature: z.number(),
  condition: conditionSchema,
  isDay: z.boolean(),
});
assertNoDrift<z.infer<typeof weatherHourSchema>, WeatherHour>();

export const weatherForecastSchema = z.object({
  units: unitsSchema,
  timezone: z.string(),
  current: z.object({
    temperature: z.number(),
    apparentTemperature: z.nullable(z.number()),
    condition: conditionSchema,
    isDay: z.boolean(),
  }),
  high: z.number(),
  low: z.number(),
  hours: z.array(weatherHourSchema),
});
assertNoDrift<z.infer<typeof weatherForecastSchema>, WeatherForecast>();

export const weatherSnapshotSchema = z.extend(weatherForecastSchema, {
  location: weatherLocationSchema,
});
assertNoDrift<z.infer<typeof weatherSnapshotSchema>, WeatherSnapshot>();

/*
 * No `weatherStateSchema` on purpose: `getWeatherState` returns the blob untouched so the
 * store can salvage its three fields independently, and a wrapper schema invites wiring in.
 */
