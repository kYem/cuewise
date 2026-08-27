import { DEFAULT_SETTINGS, type Settings } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { type Mock, vi } from 'vitest';
import { create } from 'zustand';
import { VILNIUS } from '../../stores/__fixtures__/weather-store.fixtures';
import { type SettingsStore, useSettingsStore } from '../../stores/settings-store';
import { useWeatherStore } from '../../stores/weather-store';

export interface WidgetPickerStoreOptions {
  settings?: Partial<Settings>;
  hasWeatherLocation?: boolean;
  isLoading?: boolean;
  /** Mirrors the store's real contract: a rejected write returns false and commits nothing. */
  saveSucceeds?: boolean;
  /** False models the window before the weather store has read storage. */
  weatherInitialized?: boolean;
}

/** A real Zustand store behind the mocked hook, so a toggle click re-renders like production. */
export function mockWidgetPickerStores({
  settings = {},
  hasWeatherLocation = true,
  isLoading = false,
  saveSucceeds = true,
  weatherInitialized = true,
}: WidgetPickerStoreOptions = {}) {
  const store = create<SettingsStore>((set) => ({
    settings: { ...DEFAULT_SETTINGS, ...settings },
    preview: null,
    isLoading,
    error: null,
    initialize: vi.fn(async () => {}),
    previewSettings: vi.fn(),
    clearPreview: vi.fn(),
    updateSettings: vi.fn(async (patch: Partial<Settings>) => {
      if (!saveSucceeds) {
        return false;
      }
      set((state) => ({ settings: { ...state.settings, ...patch } }));
      return true;
    }),
    resetToDefaults: vi.fn(async () => true),
  }));
  vi.mocked(useSettingsStore).mockImplementation(store);

  const location = hasWeatherLocation ? VILNIUS : null;
  vi.mocked(useWeatherStore).mockImplementation(
    createSelectorMock({ location, initialized: weatherInitialized })
  );

  return { updateSettings: store.getState().updateSettings as Mock };
}

export const ALL_WIDGETS_ON: Partial<Settings> = {
  showClock: true,
  showQuickLinks: true,
  showNotes: true,
  showWeather: true,
  newTabShowCalendar: true,
};

export const ALL_WIDGETS_OFF: Partial<Settings> = {
  showClock: false,
  showQuickLinks: false,
  showNotes: false,
  showWeather: false,
  newTabShowCalendar: false,
};
