import type { BackgroundStyle } from '@cuewise/shared';
import {
  COLOR_THEMES,
  type ColorTheme,
  DEFAULT_SETTINGS,
  FONT_SIZE_SCALES,
  type FontSize,
  LAYOUT_DENSITY_SPACING,
  type LayoutDensity,
  type Settings,
} from '@cuewise/shared';
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
  updateColorTheme: (colorTheme: ColorTheme) => Promise<void>;
  updateFontSize: (fontSize: FontSize) => Promise<void>;
  updateLayoutDensity: (density: LayoutDensity) => Promise<void>;
  updateBackgroundStyle: (style: BackgroundStyle) => Promise<void>;
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
      applyFontSize(settings.fontSize);
      applyLayoutDensity(settings.layoutDensity);
      applyBackgroundStyle(settings.backgroundStyle);
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

  updateFontSize: async (fontSize: FontSize) => {
    const { settings } = get();
    const updatedSettings = { ...settings, fontSize };

    try {
      await setSettings(updatedSettings);
      set({ settings: updatedSettings });
      applyFontSize(fontSize);
    } catch (error) {
      console.error('Error updating font size:', error);
      const errorMessage = 'Failed to update font size. Please try again.';
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

  updateBackgroundStyle: async (style: BackgroundStyle) => {
    const { settings } = get();
    const updatedSettings = { ...settings, backgroundStyle: style };

    try {
      await setSettings(updatedSettings);
      set({ settings: updatedSettings });
      applyBackgroundStyle(style);
    } catch (error) {
      console.error('Error updating background style:', error);
      const errorMessage = 'Failed to update background. Please try again.';
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

      // Apply customizations if they were updated
      if (partialSettings.theme) {
        applyTheme(partialSettings.theme);
      }
      if (partialSettings.colorTheme) {
        applyColorTheme(partialSettings.colorTheme);
      }
      if (partialSettings.fontSize) {
        applyFontSize(partialSettings.fontSize);
      }
      if (partialSettings.layoutDensity) {
        applyLayoutDensity(partialSettings.layoutDensity);
      }
      if (partialSettings.backgroundStyle) {
        applyBackgroundStyle(partialSettings.backgroundStyle);
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
      applyFontSize(DEFAULT_SETTINGS.fontSize);
      applyLayoutDensity(DEFAULT_SETTINGS.layoutDensity);
      applyBackgroundStyle(DEFAULT_SETTINGS.backgroundStyle);
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
 */
function applyColorTheme(colorTheme: ColorTheme) {
  const theme = COLOR_THEMES[colorTheme];
  const root = document.documentElement;

  // Set CSS custom properties for the color theme
  root.style.setProperty('--theme-primary', theme.primary);
  root.style.setProperty('--theme-accent', theme.accent);

  // Store the theme name as a data attribute for potential CSS selectors
  root.setAttribute('data-color-theme', colorTheme);
}

/**
 * Apply font size to the document
 */
function applyFontSize(fontSize: FontSize) {
  const scale = FONT_SIZE_SCALES[fontSize];
  const root = document.documentElement;

  // Apply font size scale as a CSS custom property
  root.style.setProperty('--font-size-scale', scale.toString());

  // Store the size name as a data attribute
  root.setAttribute('data-font-size', fontSize);
}

/**
 * Apply layout density to the document
 */
function applyLayoutDensity(density: LayoutDensity) {
  const spacing = LAYOUT_DENSITY_SPACING[density];
  const root = document.documentElement;

  // Apply spacing scale as a CSS custom property
  root.style.setProperty('--layout-spacing-scale', spacing.toString());

  // Store the density name as a data attribute
  root.setAttribute('data-layout-density', density);
}

/**
 * Apply background style to the document
 */
function applyBackgroundStyle(style: BackgroundStyle) {
  const body = document.body;

  if (style.type === 'solid') {
    body.style.background = style.value;
  } else if (style.type === 'gradient') {
    body.style.background = style.value;
  } else if (style.type === 'image') {
    body.style.background = `url('${style.value}') center/cover no-repeat fixed`;
  }
}
