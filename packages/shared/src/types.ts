// Quote categories
export type QuoteCategory =
  | 'inspiration'
  | 'learning'
  | 'productivity'
  | 'mindfulness'
  | 'success'
  | 'creativity'
  | 'resilience'
  | 'leadership'
  | 'health'
  | 'growth';

// Quote interface
export interface Quote {
  id: string;
  text: string;
  author: string;
  category: QuoteCategory;
  isCustom: boolean;
  isFavorite: boolean;
  isHidden: boolean;
  viewCount: number;
  lastViewed?: string; // ISO date string
  source?: string; // Book, URL, or other reference
  notes?: string; // Personal notes about the quote
}

// Goal interface
export interface Goal {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string; // ISO date string
  date: string; // YYYY-MM-DD
}

// Reminder interface
export interface Reminder {
  id: string;
  text: string;
  dueDate: string; // ISO date string
  completed: boolean;
  notified: boolean;
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    enabled: boolean;
  };
}

// Pomodoro session interface
export interface PomodoroSession {
  id: string;
  startedAt: string; // ISO date string
  completedAt?: string; // ISO date string
  interrupted: boolean;
  duration: number; // minutes (25 for work, 5 for break)
  type: 'work' | 'break';
}

// Customization types
export type ColorTheme = 'default' | 'ocean' | 'forest' | 'sunset' | 'lavender' | 'rose';
export type FontSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl';
export type LayoutDensity = 'compact' | 'comfortable' | 'spacious';

export interface BackgroundStyle {
  type: 'solid' | 'gradient' | 'image';
  value: string; // Color hex, gradient CSS, or image URL
}

// Settings interface
export interface Settings {
  pomodoroWorkDuration: number; // minutes (default 25)
  pomodoroBreakDuration: number; // minutes (default 5)
  enableNotifications: boolean;
  theme: 'light' | 'dark' | 'auto';
  quoteChangeInterval: number; // seconds (0 = manual, 1-3600 = auto-refresh every N seconds)
  timeFormat: '12h' | '24h'; // 12-hour (AM/PM) or 24-hour format
  // Customization
  colorTheme: ColorTheme;
  fontSize: FontSize;
  layoutDensity: LayoutDensity;
  backgroundStyle: BackgroundStyle;
}

// Storage keys
export const STORAGE_KEYS = {
  QUOTES: 'quotes',
  GOALS: 'goals',
  REMINDERS: 'reminders',
  POMODORO_SESSIONS: 'pomodoroSessions',
  SETTINGS: 'settings',
  CURRENT_QUOTE: 'currentQuote',
} as const;

// Insights data
export interface InsightsData {
  totalQuotesViewed: number;
  quotesViewedThisWeek: number;
  goalsCompletedToday: number;
  goalsCompletedThisWeek: number;
  goalsCompletedThisMonth: number;
  pomodorosCompletedToday: number;
  categoryViewCounts: Record<QuoteCategory, number>;
  streak: {
    current: number;
    longest: number;
    lastActive: string; // YYYY-MM-DD
  };
}
