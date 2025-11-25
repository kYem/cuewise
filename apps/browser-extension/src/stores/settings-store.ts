import {
  type ColorTheme,
  configureLogger,
  DEFAULT_SETTINGS,
  type LayoutDensity,
  LogLevel as LoggerLevel,
  type Settings,
} from '@cuewise/shared';
import { getSettings, migrateStorageData, setSettings } from '@cuewise/storage';
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
  updateColorTheme: (colorTheme: ColorTheme) => Promise<void>;
  updateLayoutDensity: (density: LayoutDensity) => Promise<void>;
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

      const storedSettings = await getSettings();
      // Merge with defaults to ensure all properties exist (for existing users)
      const settings = { ...DEFAULT_SETTINGS, ...storedSettings };

      set({
        settings,
        isLoading: false,
      });

      // Apply all customization on initialization
      applyTheme(settings.theme);
      applyColorTheme(settings.colorTheme);
      applyLayoutDensity(settings.layoutDensity);
      applyLogLevel(settings.logLevel);
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

  updateColorTheme: async (colorTheme: ColorTheme) => {
    const { settings } = get();
    const updatedSettings = { ...settings, colorTheme };

    try {
      await setSettings(updatedSettings);
      set({ settings: updatedSettings });
      applyColorTheme(colorTheme);
    } catch (error) {
      console.error('Error updating color theme:', error);
      const errorMessage = 'Failed to update color theme. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateLayoutDensity: async (density: LayoutDensity) => {
    const { settings } = get();
    const updatedSettings = { ...settings, layoutDensity: density };

    try {
      await setSettings(updatedSettings);
      set({ settings: updatedSettings });
      applyLayoutDensity(density);
    } catch (error) {
      console.error('Error updating layout density:', error);
      const errorMessage = 'Failed to update layout density. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateSettings: async (partialSettings: Partial<Settings>) => {
    const { settings } = get();
    const updatedSettings = { ...settings, ...partialSettings };

    try {
      // Check if syncEnabled changed
      const syncChanged =
        partialSettings.syncEnabled !== undefined &&
        partialSettings.syncEnabled !== settings.syncEnabled;

      // If sync setting changed, migrate data before saving settings
      if (syncChanged) {
        const fromArea = settings.syncEnabled ? 'sync' : 'local';
        const toArea = partialSettings.syncEnabled ? 'sync' : 'local';

        useToastStore.getState().success(`Migrating data to ${toArea} storage...`);
        const migrated = await migrateStorageData(fromArea, toArea);

        if (!migrated) {
          const errorMessage = 'Failed to migrate data. Please try again.';
          set({ error: errorMessage });
          useToastStore.getState().error(errorMessage);
          return;
        }
      }

      await setSettings(updatedSettings);
      set({ settings: updatedSettings });

      // Apply customizations if they were updated
      if (partialSettings.theme) {
        applyTheme(partialSettings.theme);
      }
      if (partialSettings.colorTheme) {
        applyColorTheme(partialSettings.colorTheme);
      }
      if (partialSettings.layoutDensity) {
        applyLayoutDensity(partialSettings.layoutDensity);
      }
      if (partialSettings.logLevel !== undefined) {
        applyLogLevel(partialSettings.logLevel);
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
      applyColorTheme(DEFAULT_SETTINGS.colorTheme);
      applyLayoutDensity(DEFAULT_SETTINGS.layoutDensity);
      applyLogLevel(DEFAULT_SETTINGS.logLevel);
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

/**
 * Apply color theme to the document
 * Using Tailwind v4's @layer theme approach - just set data attribute, CSS handles the rest
 */
function applyColorTheme(colorTheme: ColorTheme) {
  document.documentElement.setAttribute('data-theme', colorTheme);
}

/**
 * Apply layout density to the document
 * Using Tailwind v4's @layer theme approach - just set data attribute, CSS handles the rest
 */
function applyLayoutDensity(density: LayoutDensity) {
  document.documentElement.setAttribute('data-density', density);
}

/**
 * Configure global logger based on settings
 */
function applyLogLevel(logLevel: Settings['logLevel']) {
  if (logLevel === 'none') {
    configureLogger({ enabled: false });
  } else {
    // Map our LogLevel type to the logger's LogLevel enum
    const levelMap: Record<Exclude<Settings['logLevel'], 'none'>, LoggerLevel> = {
      debug: LoggerLevel.DEBUG,
      info: LoggerLevel.INFO,
      warn: LoggerLevel.WARN,
      error: LoggerLevel.ERROR,
    };

    configureLogger({
      enabled: true,
      minLevel: levelMap[logLevel],
    });
  }
}
