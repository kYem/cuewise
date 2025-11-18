import type { ColorTheme, LayoutDensity, QuoteCategory, Settings } from './types';

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  pomodoroWorkDuration: 25,
  pomodoroBreakDuration: 5,
  pomodoroLongBreakDuration: 15,
  pomodoroLongBreakInterval: 4,
  pomodoroAutoStartBreaks: true, // Auto-cycle continuously by default
  pomodoroAmbientSound: 'none',
  pomodoroAmbientVolume: 50,
  enableNotifications: true,
  theme: 'light',
  quoteChangeInterval: 10, // 0 = manual, 10+ = auto-refresh interval in seconds
  timeFormat: '12h',
  syncEnabled: false, // Disabled by default for privacy
  colorTheme: 'purple',
  layoutDensity: 'comfortable',
  showThemeSwitcher: false,
  enableGoalTransfer: true,
  goalTransferTime: 20, // 8 PM (20:00)
};

// Quote categories with display names
export const QUOTE_CATEGORIES: Record<QuoteCategory, string> = {
  inspiration: 'Inspiration',
  learning: 'Learning',
  productivity: 'Productivity',
  mindfulness: 'Mindfulness',
  success: 'Success',
  creativity: 'Creativity',
  resilience: 'Resilience',
  leadership: 'Leadership',
  health: 'Health',
  growth: 'Growth',
};

// Category colors (for UI)
export const CATEGORY_COLORS: Record<QuoteCategory, string> = {
  inspiration: '#8B5CF6', // purple
  learning: '#3B82F6', // blue
  productivity: '#10B981', // green
  mindfulness: '#06B6D4', // cyan
  success: '#F59E0B', // amber
  creativity: '#EC4899', // pink
  resilience: '#EF4444', // red
  leadership: '#6366F1', // indigo
  health: '#14B8A6', // teal
  growth: '#84CC16', // lime
};

// Ambient sound options for Pomodoro
export const AMBIENT_SOUNDS = {
  none: 'None',
  rain: 'Rain',
  ocean: 'Ocean Waves',
  forest: 'Forest',
  cafe: 'Cafe Ambience',
  whiteNoise: 'White Noise',
  brownNoise: 'Brown Noise',
} as const;

export type AmbientSoundType = keyof typeof AMBIENT_SOUNDS;

// Color theme definitions
export const COLOR_THEMES: Record<
  ColorTheme,
  { name: string; primary: string; background: string; accent: string }
> = {
  purple: {
    name: 'Purple',
    primary: '#8B5CF6',
    background: 'linear-gradient(to bottom right, #faf5ff, #eff6ff, #e0e7ff)',
    accent: '#7c3aed',
  },
  forest: {
    name: 'Forest Green',
    primary: '#10b981',
    background: 'linear-gradient(to bottom right, #f0fdf4, #dcfce7, #bbf7d0)',
    accent: '#059669',
  },
  rose: {
    name: 'Rose Pink',
    primary: '#f43f5e',
    background: 'linear-gradient(to bottom right, #fff1f2, #ffe4e6, #fecdd3)',
    accent: '#e11d48',
  },
};

// Layout density spacing multipliers
export const LAYOUT_DENSITY_SPACING: Record<LayoutDensity, number> = {
  compact: 0.75,
  comfortable: 1,
  spacious: 1.25,
};
