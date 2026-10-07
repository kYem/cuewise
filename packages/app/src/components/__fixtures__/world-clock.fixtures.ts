import {
  DEFAULT_SETTINGS,
  type Settings,
  type WeatherLocation,
  type WorldClockZone,
} from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { vi } from 'vitest';
import { useSettingsStore } from '../../stores/settings-store';

/** Monday, 13:00 in London (BST), 21:00 in Tokyo, 08:00 in New York, 00:00 Tuesday in Auckland. */
export const MONDAY_NOON_UTC = new Date('2026-06-15T12:00:00Z');
export const HOME_ZONE = 'Europe/London';

export const TOKYO_ZONE: WorldClockZone = { id: 'tokyo', label: 'Tokyo', timezone: 'Asia/Tokyo' };
export const NEW_YORK_ZONE: WorldClockZone = {
  id: 'new-york',
  label: 'NYC team',
  timezone: 'America/New_York',
};
export const AUCKLAND_ZONE: WorldClockZone = {
  id: 'auckland',
  label: 'Auckland',
  timezone: 'Pacific/Auckland',
};
/** A zone a newer engine could have synced that this one cannot format. */
export const BROKEN_ZONE: WorldClockZone = {
  id: 'broken',
  label: 'Mars base',
  timezone: 'Not/AZone',
};

export function mockWorldClockSettings(overrides: Partial<Settings> = {}): Settings {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    timeFormat: '24h',
    showWorldClock: true,
    worldClocks: [TOKYO_ZONE],
    ...overrides,
  };
  vi.mocked(useSettingsStore).mockImplementation(createSelectorMock({ settings }));
  return settings;
}

export const AUSTIN_PLACE: WeatherLocation = {
  id: '4671654',
  name: 'Austin',
  admin1: 'Texas',
  country: 'United States',
  countryCode: 'US',
  latitude: 30.26715,
  longitude: -97.74306,
  timezone: 'America/Chicago',
};

/** The geocoder's answer for a city the offline zone list already found. */
export const TOKYO_PLACE: WeatherLocation = {
  id: '1850147',
  name: 'Tokyo',
  admin1: 'Tokyo',
  country: 'Japan',
  countryCode: 'JP',
  latitude: 35.6895,
  longitude: 139.69171,
  timezone: 'Asia/Tokyo',
};

/** The geocoder uses today's zone id; the engine's own list may still say Asia/Calcutta. */
export const KOLKATA_PLACE: WeatherLocation = {
  id: '1275004',
  name: 'Kolkata',
  admin1: 'West Bengal',
  country: 'India',
  countryCode: 'IN',
  latitude: 22.56263,
  longitude: 88.36304,
  timezone: 'Asia/Kolkata',
};
