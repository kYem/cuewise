import type {
  ColorTheme,
  FocusImageCategory,
  LayoutDensity,
  QuoteCategory,
  ReminderCategory,
  ReminderTemplate,
  Settings,
  YoutubePlaylist,
} from './types';

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  pomodoroWorkDuration: 25,
  pomodoroBreakDuration: 5,
  pomodoroLongBreakDuration: 15,
  pomodoroLongBreakInterval: 4,
  pomodoroAutoStartBreaks: true, // Auto-cycle continuously by default
  pomodoroAmbientSound: 'none',
  pomodoroAmbientVolume: 50,
  pomodoroStartSound: 'gentle',
  pomodoroCompletionSound: 'gentle',
  // Pomodoro Music (YouTube integration)
  pomodoroMusicEnabled: true,
  pomodoroMusicVolume: 50,
  pomodoroMusicAutoStart: false,
  pomodoroMusicPlaylistId: '',
  pomodoroMusicPlayDuringBreaks: false,
  enableNotifications: true,
  theme: 'auto',
  quoteChangeInterval: 10, // 0 = manual, 10+ = auto-refresh interval in seconds
  timeFormat: '12h',
  syncEnabled: false, // Disabled by default for privacy
  colorTheme: 'forest',
  layoutDensity: 'comfortable',
  showThemeSwitcher: false,
  showClock: false, // Clock hidden by default for simpler UI
  enableGoalTransfer: true,
  goalTransferTime: 20, // 8 PM (20:00)
  logLevel: 'error', // Only show errors by default
  hasSeenOnboarding: false, // Show welcome modal on first visit
  // Focus Mode defaults
  focusModeEnabled: true, // Enable by default
  focusModeImageCategory: 'nature', // Nature photos by default
  focusModeShowQuote: true, // Show quote overlay
  focusModeAutoEnter: false, // Don't auto-enter (user choice)
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

// All quote categories as an array (for filters)
export const ALL_QUOTE_CATEGORIES: QuoteCategory[] = Object.keys(
  QUOTE_CATEGORIES
) as QuoteCategory[];

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

// Notification sound options for Pomodoro start/completion
export const NOTIFICATION_SOUNDS = {
  none: 'None',
  chime: 'Chime',
  bell: 'Bell',
  digital: 'Digital',
  gentle: 'Gentle',
} as const;

export type NotificationSoundType = keyof typeof NOTIFICATION_SOUNDS;

// Default YouTube playlists for Pomodoro music (curated focus music)
// Each playlist includes a firstVideoId for proper embed support
export const DEFAULT_YOUTUBE_PLAYLISTS: YoutubePlaylist[] = [
  {
    id: 'lofi-hip-hop',
    name: 'Lofi Hip Hop',
    playlistId: 'PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo',
    thumbnailUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    firstVideoId: 'jfKfPfyJRdk',
    isCustom: false,
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    playlistId: 'PLvLlb2QOBKR2Jh_uQC8bPWNjWk_YYa3y',
    thumbnailUrl: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
    firstVideoId: '4xDzrJKXOOY',
    isCustom: false,
  },
  {
    id: 'chill-beats',
    name: 'Chill Beats',
    playlistId: 'PLofht4PTcKYnaH8w5olJCI-wUVxuoMHqM',
    thumbnailUrl: 'https://i.ytimg.com/vi/lTRiuFIWV54/hqdefault.jpg',
    firstVideoId: 'lTRiuFIWV54',
    isCustom: false,
  },
  {
    id: 'jazz',
    name: 'Jazz for Work',
    playlistId: 'PLgzTt0k8mXzEpH7-dOCHqRZOsakqXmzmG',
    thumbnailUrl: 'https://i.ytimg.com/vi/fEvM-OUbaKs/hqdefault.jpg',
    firstVideoId: 'fEvM-OUbaKs',
    isCustom: false,
  },
  {
    id: 'deep-focus',
    name: 'Deep Focus',
    playlistId: 'PLWoofaG1KBZsnGBJRkY4UBpPsE94z2Qk9',
    thumbnailUrl: 'https://i.ytimg.com/vi/DWcJFNfaw9c/hqdefault.jpg',
    firstVideoId: 'DWcJFNfaw9c',
    isCustom: false,
  },
  {
    id: 'nature-sounds',
    name: 'Nature Sounds',
    playlistId: 'PLQ_PIlf6OzqJzXo8KTHCvTAQXXXyvlz2w',
    thumbnailUrl: 'https://i.ytimg.com/vi/eKFTSSKCzWA/hqdefault.jpg',
    firstVideoId: 'eKFTSSKCzWA',
    isCustom: false,
  },
];

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
  glass: {
    name: 'Glass',
    primary: 'rgba(255, 255, 255, 0.8)',
    background: 'transparent',
    accent: 'rgba(255, 255, 255, 0.9)',
  },
};

// Layout density spacing multipliers
export const LAYOUT_DENSITY_SPACING: Record<LayoutDensity, number> = {
  compact: 0.75,
  comfortable: 1,
  spacious: 1.25,
};

// Focus mode image categories with display names
export const FOCUS_IMAGE_CATEGORIES: Record<FocusImageCategory, string> = {
  nature: 'Nature',
  forest: 'Forest',
  ocean: 'Ocean',
  mountains: 'Mountains',
  minimal: 'Minimal',
  dark: 'Dark',
};

// All focus image categories as an array (for UI)
export const ALL_FOCUS_IMAGE_CATEGORIES: FocusImageCategory[] = Object.keys(
  FOCUS_IMAGE_CATEGORIES
) as FocusImageCategory[];

// App configuration links
export const APP_LINKS = {
  website: 'https://cuewise.app/',
  changelog: 'https://github.com/kYem/cuewise/blob/main/apps/browser-extension/CHANGELOG.md',
  github: 'https://github.com/kYem/cuewise',
} as const;

// Reminder category display names
export const REMINDER_CATEGORIES: Record<ReminderCategory, string> = {
  health: 'Health & Wellness',
  productivity: 'Productivity',
  personal: 'Personal',
};

// Built-in reminder templates for quick creation
export const REMINDER_TEMPLATES: ReminderTemplate[] = [
  // Health & Wellness
  {
    id: 'water',
    name: 'Drink Water',
    text: 'Time to drink water',
    defaultTime: '10:00',
    frequency: 'daily',
    category: 'health',
  },
  {
    id: 'stretch',
    name: 'Stretch Break',
    text: 'Take a stretch break',
    defaultTime: '14:00',
    frequency: 'daily',
    category: 'health',
  },
  {
    id: 'eyes',
    name: 'Eye Rest',
    text: 'Look away from screen (20-20-20 rule)',
    defaultTime: '11:00',
    frequency: 'daily',
    category: 'health',
  },
  {
    id: 'medication',
    name: 'Medication',
    text: 'Take your medication',
    defaultTime: '08:00',
    frequency: 'daily',
    category: 'health',
  },
  {
    id: 'exercise',
    name: 'Exercise',
    text: 'Time for your workout',
    defaultTime: '07:00',
    frequency: 'daily',
    category: 'health',
  },
  // Productivity
  {
    id: 'standup',
    name: 'Daily Standup',
    text: 'Time for standup meeting',
    defaultTime: '09:00',
    frequency: 'daily',
    category: 'productivity',
  },
  {
    id: 'review',
    name: 'End of Day Review',
    text: "Review today's accomplishments",
    defaultTime: '17:00',
    frequency: 'daily',
    category: 'productivity',
  },
  {
    id: 'weekly-review',
    name: 'Weekly Review',
    text: 'Weekly planning and review session',
    defaultTime: '09:00',
    frequency: 'weekly',
    category: 'productivity',
  },
  // Personal
  {
    id: 'journal',
    name: 'Daily Journal',
    text: 'Write in your journal',
    defaultTime: '21:00',
    frequency: 'daily',
    category: 'personal',
  },
  {
    id: 'gratitude',
    name: 'Gratitude',
    text: "Write 3 things you're grateful for",
    defaultTime: '08:00',
    frequency: 'daily',
    category: 'personal',
  },
];
