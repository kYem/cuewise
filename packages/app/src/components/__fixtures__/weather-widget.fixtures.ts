import {
  DEFAULT_SETTINGS,
  type Settings,
  type WeatherLocation,
  type WeatherSnapshot,
} from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { vi } from 'vitest';
import { LONDON, snapshot } from '../../stores/__fixtures__/weather-store.fixtures';
import { useSettingsStore } from '../../stores/settings-store';
import { useWeatherStore } from '../../stores/weather-store';

export interface WeatherStoreOverrides {
  location?: WeatherLocation | null;
  snapshot?: WeatherSnapshot | null;
  isFetching?: boolean;
  error?: string | null;
  lastFetch?: string | null;
  searchResults?: WeatherLocation[];
  isSearching?: boolean;
  searchError?: string | null;
  searchedFor?: string | null;
}

export function mockWeatherStore(overrides: WeatherStoreOverrides = {}) {
  const state = {
    location: overrides.location === undefined ? LONDON : overrides.location,
    snapshot: overrides.snapshot === undefined ? snapshot() : overrides.snapshot,
    inFlight: overrides.isFetching === true ? { id: 1, epoch: 0, units: 'metric' as const } : null,
    error: overrides.error ?? null,
    lastFetch: overrides.lastFetch === undefined ? new Date().toISOString() : overrides.lastFetch,
    searchResults: overrides.searchResults ?? [],
    isSearching: overrides.isSearching ?? false,
    searchError: overrides.searchError ?? null,
    searchedFor: overrides.searchedFor ?? null,
    epoch: 0,
    initialize: vi.fn(),
    setLocation: vi.fn(),
    clearLocation: vi.fn(),
    refresh: vi.fn(),
    search: vi.fn(),
    clearSearch: vi.fn(),
  };
  vi.mocked(useWeatherStore).mockImplementation(createSelectorMock(state));
  return state;
}

export function mockSettings(overrides: Partial<Settings> = {}) {
  const settings: Settings = { ...DEFAULT_SETTINGS, showWeather: true, ...overrides };
  vi.mocked(useSettingsStore).mockImplementation(createSelectorMock({ settings }));
  return settings;
}
