import {
  DEFAULT_SETTINGS,
  type Settings,
  WEATHER_STALE_MS,
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

/** A reading the staleness timer must act on. */
export function staleReading(): string {
  return new Date(Date.now() - (WEATHER_STALE_MS + 60_000)).toISOString();
}

/** A reading left stamped ahead of now by a clock that stepped back under it. */
export function futureStampedReading(): string {
  return new Date(Date.now() + 30 * 60_000).toISOString();
}

/** Flips the in-flight slot without re-mocking, which would hand back a fresh refresh spy. */
export function setFetching(state: ReturnType<typeof mockWeatherStore>, fetching: boolean): void {
  state.inFlight = fetching ? { id: 1, epoch: 0, units: 'metric' as const } : null;
}

export function mockSettings(overrides: Partial<Settings> = {}) {
  const settings: Settings = { ...DEFAULT_SETTINGS, showWeather: true, ...overrides };
  vi.mocked(useSettingsStore).mockImplementation(createSelectorMock({ settings }));
  return settings;
}
