import { DEFAULT_SETTINGS, type Settings, type WeatherSnapshot } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { vi } from 'vitest';
import { LONDON, snapshot } from '../../stores/__fixtures__/weather-store.fixtures';
import { useSettingsStore } from '../../stores/settings-store';
import { useWeatherStore } from '../../stores/weather-store';

export interface WeatherStoreOverrides {
  location?: typeof LONDON | null;
  snapshot?: WeatherSnapshot | null;
  isLoading?: boolean;
  error?: string | null;
  lastFetch?: string | null;
}

export function mockWeatherStore(overrides: WeatherStoreOverrides = {}) {
  const state = {
    location: overrides.location === undefined ? LONDON : overrides.location,
    snapshot: overrides.snapshot === undefined ? snapshot() : overrides.snapshot,
    isLoading: overrides.isLoading ?? false,
    error: overrides.error ?? null,
    lastFetch: overrides.lastFetch ?? new Date().toISOString(),
    searchResults: [],
    isSearching: false,
    searchError: null,
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
