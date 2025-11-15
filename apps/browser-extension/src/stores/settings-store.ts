import { DEFAULT_SETTINGS, type Settings } from '@cuewise/shared';
import { getSettings, setSettings } from '@cuewise/storage';
import { create } from 'zustand';
import { useToastStore } from './toast-store';

interface SettingsStore {
  // State
  settings: Settings;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  updatePomodoroWorkDuration: (duration: number) => Promise<void>;
  updatePomodoroBreakDuration: (duration: number) => Promise<void>;
  updateTheme: (theme: Settings['theme']) => Promise<void>;
  updateNotifications: (enabled: boolean) => Promise<void>;
  updateQuoteChangeInterval: (interval: Settings['quoteChangeInterval']) => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // Initial state
  settings: DEFAULT_SETTINGS,
  isLoading: true,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      const settings = await getSettings();

      set({
        settings,
        isLoading: false,
      });

      // Apply theme on initialization
      applyTheme(settings.theme);
    } catch (error) {
      console.error('Error initializing settings store:', error);
      const errorMessage = 'Failed to load settings. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  updatePomodoroWorkDuration: async (duration: number) => {
    const { settings } = get();
    const updatedSettings = { ...settings, pomodoroWorkDuration: duration };

    try {
      await setSettings(updatedSettings);
      set({ settings: updatedSettings });
    } catch (error) {
      console.error('Error updating work duration:', error);
      const errorMessage = 'Failed to update work duration. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updatePomodoroBreakDuration: async (duration: number) => {
    const { settings } = get();
    const updatedSettings = { ...settings, pomodoroBreakDuration: duration };

    try {
      await setSettings(updatedSettings);
      set({ settings: updatedSettings });
    } catch (error) {
      console.error('Error updating break duration:', error);
      const errorMessage = 'Failed to update break duration. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateTheme: async (theme: Settings['theme']) => {
    const { settings } = get();
    const updatedSettings = { ...settings, theme };

    try {
      await setSettings(updatedSettings);
      set({ settings: updatedSettings });
      applyTheme(theme);
    } catch (error) {
      console.error('Error updating theme:', error);
      const errorMessage = 'Failed to update theme. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateNotifications: async (enabled: boolean) => {
    const { settings } = get();
    const updatedSettings = { ...settings, enableNotifications: enabled };

    try {
      // Request notification permission if enabling
      if (enabled && 'Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          const errorMessage =
            'Notification permission denied. Please enable notifications in your browser settings.';
          set({ error: errorMessage });
          useToastStore.getState().warning(errorMessage);
          return;
        }
      }

      await setSettings(updatedSettings);
      set({ settings: updatedSettings });
    } catch (error) {
      console.error('Error updating notifications:', error);
      const errorMessage = 'Failed to update notifications. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateQuoteChangeInterval: async (interval: number) => {
    const { settings } = get();
    // Validate interval: 0 for manual, or 10-3600 for auto-refresh (minimum 10 seconds)
    const validInterval = interval === 0 ? 0 : Math.max(10, Math.min(3600, interval));
    const updatedSettings = { ...settings, quoteChangeInterval: validInterval };

    try {
      await setSettings(updatedSettings);
      set({ settings: updatedSettings });
    } catch (error) {
      console.error('Error updating quote interval:', error);
      const errorMessage = 'Failed to update quote interval. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateSettings: async (partialSettings: Partial<Settings>) => {
    const { settings } = get();
    const updatedSettings = { ...settings, ...partialSettings };

    try {
      await setSettings(updatedSettings);
      set({ settings: updatedSettings });

      // Apply theme if it was updated
      if (partialSettings.theme) {
        applyTheme(partialSettings.theme);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      const errorMessage = 'Failed to update settings. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  resetToDefaults: async () => {
    try {
      await setSettings(DEFAULT_SETTINGS);
      set({ settings: DEFAULT_SETTINGS });
      applyTheme(DEFAULT_SETTINGS.theme);
    } catch (error) {
      console.error('Error resetting settings:', error);
      const errorMessage = 'Failed to reset settings. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },
}));

/**
 * Apply theme to the document
 */
function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement;

  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else if (theme === 'auto') {
    // Use system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}
