import { z } from 'zod/mini';
import type {
  WeatherForecast,
  WeatherHour,
  WeatherLocation,
  WeatherSnapshot,
  WeatherState,
} from '../types';
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
  timezone: z.string(),
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

export const weatherStateSchema = z.object({
  location: z.nullable(weatherLocationSchema),
  snapshot: z.nullable(weatherSnapshotSchema),
  lastFetch: z.nullable(z.string()),
});
assertNoDrift<z.infer<typeof weatherStateSchema>, WeatherState>();
