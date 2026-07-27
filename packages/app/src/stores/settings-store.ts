import {
  type ColorTheme,
  clampBackgroundEffects,
  clampPomodoroDurations,
  configureLogger,
  DEFAULT_SETTINGS,
  DEVICE_LOCAL_SETTINGS_KEYS,
  type LayoutDensity,
  LogLevel as LoggerLevel,
  logger,
  notifyMutated,
  type Settings,
  type StorageError,
} from '@cuewise/shared';
import { getSettings, migrateStorageData, setSettings, setSettingsRaw } from '@cuewise/storage';
import { create } from 'zustand';
import { useToastStore } from './toast-store';

// Exactly the keys with preview-aware selectors; widen only alongside a new selector.
export type PreviewableSettings = Pick<Settings, 'backgroundDim' | 'backgroundBlur'>;

/** Quota failures get actionable copy; anything else keeps the generic retry message. */
function settingsWriteErrorMessage(error: StorageError, fallback: string): string {
  if (error.type === 'quota_exceeded' || error.type === 'per_item_quota_exceeded') {
    return 'Storage is full — could not save settings. Clear some data to continue.';
  }
  return fallback;
}

/**
 * Overlay entries that differ from what a resolving write just persisted belong to a
 * newer gesture that started while the write was in flight — keep those, drop the rest.
 */
function reconcilePreview(
  preview: Partial<PreviewableSettings> | null,
  persisted: Settings
): Partial<PreviewableSettings> | null {
  if (preview === null) {
    return null;
  }
  const remaining = Object.fromEntries(
    Object.entries(preview).filter(([key, value]) => persisted[key as keyof Settings] !== value)
  ) as Partial<PreviewableSettings>;
  if (Object.keys(remaining).length === 0) {
    return null;
  }
  return remaining;
}

export interface SettingsStore {
  // State
  settings: Settings;
  // Ephemeral overlay for live slider previews; never persisted. A commit drops the
  // entries it persisted (newer in-flight gestures survive); failures drop it whole.
  // Kept out of `settings` so updateSettings still diffs against persisted truth.
  preview: Partial<PreviewableSettings> | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  previewSettings: (settings: Partial<PreviewableSettings>) => void;
  clearPreview: () => void;
  updateTheme: (theme: Settings['theme']) => Promise<void>;
  updateNotifications: (enabled: boolean) => Promise<void>;
  updateQuoteChangeInterval: (interval: Settings['quoteChangeInterval']) => Promise<void>;
  updateColorTheme: (colorTheme: ColorTheme) => Promise<void>;
  updateLayoutDensity: (density: LayoutDensity) => Promise<void>;
  // Both resolve true only when the write actually persisted, so callers can
  // gate "saved" affordances — the storage adapters report failure via the
  // result object rather than throwing.
  updateSettings: (settings: Partial<Settings>) => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // Initial state
  settings: DEFAULT_SETTINGS,
  preview: null,
  isLoading: true,
  error: null,

  previewSettings: (partialSettings: Partial<PreviewableSettings>) => {
    const { preview } = get();
    set({ preview: { ...preview, ...partialSettings } });
  },

  clearPreview: () => {
    set({ preview: null });
  },

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      const storedSettings = await getSettings();
      // Merge with defaults to ensure all properties exist (for existing users)
      const settings = { ...DEFAULT_SETTINGS, ...storedSettings };

      set({
        settings,
        preview: null,
        isLoading: false,
      });

      // Apply all customization on initialization
      applyTheme(settings.theme);
      applyColorTheme(settings.colorTheme);
      applyGlassEnhanced(settings.glassEnhanced);
      applyLayoutDensity(settings.layoutDensity);
      applyLogLevel(settings.logLevel);
    } catch (error) {
      logger.error('Error initializing settings store', error);
      const errorMessage = 'Failed to load settings. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateTheme: async (theme: Settings['theme']) => {
    const { settings } = get();
    const updatedSettings = { ...settings, theme };

    try {
      await setSettings(updatedSettings);
      set({ settings: updatedSettings });
      notifyMutated('settings', 'theme');
      applyTheme(theme);
    } catch (error) {
      logger.error('Error updating theme', error);
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
      notifyMutated('settings', 'enableNotifications');
    } catch (error) {
      logger.error('Error updating notifications', error);
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
      notifyMutated('settings', 'quoteChangeInterval');
    } catch (error) {
      logger.error('Error updating quote interval', error);
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
      notifyMutated('settings', 'colorTheme');
      applyColorTheme(colorTheme);
    } catch (error) {
      logger.error('Error updating color theme', error);
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
      notifyMutated('settings', 'layoutDensity');
      applyLayoutDensity(density);
    } catch (error) {
      logger.error('Error updating layout density', error);
      const errorMessage = 'Failed to update layout density. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateSettings: async (partialSettings: Partial<Settings>) => {
    const { settings } = get();

    try {
      // Clamp ranged values here — the settings write path the UI uses — so
      // presets/steppers (and a future settings import) can't persist an out-of-range
      // value. Inside the try so a future throwing clamp is caught here.
      const clampedPartial = clampBackgroundEffects(clampPomodoroDurations(partialSettings));
      const updatedSettings = { ...settings, ...clampedPartial };

      // Check if syncEnabled changed
      const syncChanged =
        partialSettings.syncEnabled !== undefined &&
        partialSettings.syncEnabled !== settings.syncEnabled;

      // If sync setting changed, migrate data before saving settings
      if (syncChanged) {
        const fromArea = settings.syncEnabled ? 'sync' : 'local';
        const toArea = partialSettings.syncEnabled ? 'sync' : 'local';

        useToastStore.getState().success(`Migrating data to ${toArea} storage...`);
        const migrateResult = await migrateStorageData(fromArea, toArea);

        if (!migrateResult.success) {
          let errorMessage = 'Failed to migrate data. Please try again.';

          // Provide specific error message for quota errors
          if (migrateResult.error.type === 'per_item_quota_exceeded') {
            errorMessage = `Cannot enable sync: "${migrateResult.error.key}" exceeds the 8KB per-item limit. Try clearing old data first.`;
          } else if (migrateResult.error.type === 'quota_exceeded') {
            errorMessage =
              'Cannot enable sync: Your data exceeds the 100KB sync storage limit. Try clearing old data first.';
          }

          set({ error: errorMessage, preview: null });
          useToastStore.getState().error(errorMessage);
          return false;
        }
      }

      // The storage adapters never throw — failures come back as a result object,
      // so an unchecked write would silently claim success on e.g. quota exhaustion.
      const writeResult = await setSettings(updatedSettings);
      if (!writeResult.success) {
        logger.error('Error persisting settings', writeResult.error);
        const errorMessage = settingsWriteErrorMessage(
          writeResult.error,
          'Failed to update settings. Please try again.'
        );
        set({ error: errorMessage, preview: null });
        useToastStore.getState().error(errorMessage);
        return false;
      }
      set({ settings: updatedSettings, preview: reconcilePreview(get().preview, updatedSettings) });

      // Sync every changed key that isn't device-local (each setting syncs per-key, spec §2).
      for (const key of Object.keys(clampedPartial)) {
        if (
          !DEVICE_LOCAL_SETTINGS_KEYS.includes(key) &&
          updatedSettings[key as keyof Settings] !== settings[key as keyof Settings]
        ) {
          notifyMutated('settings', key);
        }
      }

      // Apply customizations if they were updated
      if (partialSettings.theme) {
        applyTheme(partialSettings.theme);
      }
      if (partialSettings.colorTheme) {
        applyColorTheme(partialSettings.colorTheme);
      }
      if (partialSettings.glassEnhanced !== undefined) {
        applyGlassEnhanced(partialSettings.glassEnhanced);
      }
      if (partialSettings.layoutDensity) {
        applyLayoutDensity(partialSettings.layoutDensity);
      }
      if (partialSettings.logLevel !== undefined) {
        applyLogLevel(partialSettings.logLevel);
      }
      return true;
    } catch (error) {
      logger.error('Error updating settings', error);
      const errorMessage = 'Failed to update settings. Please try again.';
      // Drop any preview too, so the visible state snaps back to persisted truth.
      set({ error: errorMessage, preview: null });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  resetToDefaults: async () => {
    try {
      // Raw: a reset means every field, including the ones this build cannot read. The
      // preserving write would keep those — it cannot tell "reset to the default" from
      // "never saw it" — so the one action that should clear everything would not.
      const writeResult = await setSettingsRaw(DEFAULT_SETTINGS);
      if (!writeResult.success) {
        logger.error('Error persisting settings reset', writeResult.error);
        const errorMessage = settingsWriteErrorMessage(
          writeResult.error,
          'Failed to reset settings. Please try again.'
        );
        set({ error: errorMessage, preview: null });
        useToastStore.getState().error(errorMessage);
        return false;
      }
      set({ settings: DEFAULT_SETTINGS, preview: null });
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!DEVICE_LOCAL_SETTINGS_KEYS.includes(key)) {
          notifyMutated('settings', key);
        }
      }
      applyTheme(DEFAULT_SETTINGS.theme);
      applyColorTheme(DEFAULT_SETTINGS.colorTheme);
      applyGlassEnhanced(DEFAULT_SETTINGS.glassEnhanced);
      applyLayoutDensity(DEFAULT_SETTINGS.layoutDensity);
      applyLogLevel(DEFAULT_SETTINGS.logLevel);
      return true;
    } catch (error) {
      logger.error('Error resetting settings', error);
      const errorMessage = 'Failed to reset settings. Please try again.';
      set({ error: errorMessage, preview: null });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },
}));

// Preview-aware selectors: consumers see the in-progress drag, falling back to persisted settings.
export function selectBackgroundDim(state: SettingsStore): number {
  return state.preview?.backgroundDim ?? state.settings.backgroundDim;
}

export function selectBackgroundBlur(state: SettingsStore): number {
  return state.preview?.backgroundBlur ?? state.settings.backgroundBlur;
}

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
 * Toggle the opt-in Glass enhancement. The CSS keys off `[data-theme="glass"].glass-enhanced`.
 */
function applyGlassEnhanced(enabled: boolean) {
  document.documentElement.classList.toggle('glass-enhanced', enabled);
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
