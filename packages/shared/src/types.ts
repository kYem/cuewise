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
  transferCount?: number; // Number of times goal was transferred to next day
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
  duration: number; // minutes (25 for work, 5 for break, 15 for long break)
  type: 'work' | 'break' | 'longBreak';
  goalId?: string; // Optional goal this session is associated with
}

// Customization types
export type ColorTheme = 'purple' | 'forest' | 'rose';
export type LayoutDensity = 'compact' | 'comfortable' | 'spacious';
export type SettingsLogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';

// Settings interface
export interface Settings {
  pomodoroWorkDuration: number; // minutes (default 25)
  pomodoroBreakDuration: number; // minutes (default 5)
  pomodoroLongBreakDuration: number; // minutes (default 15)
  pomodoroLongBreakInterval: number; // number of work sessions before long break (default 4)
  pomodoroAutoStartBreaks: boolean; // auto-cycle between work and breaks continuously (default true)
  pomodoroAmbientSound: string; // ambient sound type (default 'none')
  pomodoroAmbientVolume: number; // volume 0-100 (default 50)
  enableNotifications: boolean;
  theme: 'light' | 'dark' | 'auto';
  quoteChangeInterval: number; // seconds (0 = manual, 1-3600 = auto-refresh every N seconds)
  timeFormat: '12h' | '24h'; // 12-hour (AM/PM) or 24-hour format
  syncEnabled: boolean; // Enable Chrome sync for cross-device synchronization (default false)
  // Customization
  colorTheme: ColorTheme;
  layoutDensity: LayoutDensity;
  showThemeSwitcher: boolean; // Show live theme switcher sidebar
  // Goal Transfer
  enableGoalTransfer: boolean; // Enable goal transfer feature (default true)
  goalTransferTime: number; // Hour (0-23) when transfer button appears (default 20 for 8 PM)
  // Debug
  logLevel: SettingsLogLevel; // Console log level (default 'error')
}

// Storage keys
export const STORAGE_KEYS = {
  QUOTES: 'quotes', // Legacy key - kept for migration
  SEED_QUOTES: 'seedQuotes', // Seed quotes (always in local storage)
  CUSTOM_QUOTES: 'customQuotes', // Custom quotes (in sync storage when enabled)
  GOALS: 'goals',
  REMINDERS: 'reminders',
  POMODORO_SESSIONS: 'pomodoroSessions',
  POMODORO_STATE: 'pomodoroState',
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
  focusTimeToday: number; // minutes
  focusTimeThisWeek: number; // minutes
  categoryViewCounts: Record<QuoteCategory, number>;
  streak: {
    current: number;
    longest: number;
    lastActive: string; // YYYY-MM-DD
  };
}

// Advanced analytics types

// Daily data point for trend charts
export interface DailyDataPoint {
  date: string; // YYYY-MM-DD
  goalsCompleted: number;
  focusTime: number; // minutes
  pomodorosCompleted: number;
}

// Weekly trend data
export interface WeeklyTrend {
  weekLabel: string; // e.g., "Jan 8-14"
  goalsCompleted: number;
  focusTime: number; // minutes
  pomodorosCompleted: number;
}

// Monthly trend data
export interface MonthlyTrend {
  month: string; // e.g., "January 2025"
  goalsCompleted: number;
  focusTime: number; // minutes
  pomodorosCompleted: number;
}

// Goal completion rate data
export interface GoalCompletionRate {
  totalGoals: number;
  completedGoals: number;
  completionRate: number; // 0-100 percentage
  thisWeek: {
    totalGoals: number;
    completedGoals: number;
    completionRate: number;
  };
  thisMonth: {
    totalGoals: number;
    completedGoals: number;
    completionRate: number;
  };
}

// Pomodoro heatmap data - hour of day (0-23) with count
export interface PomodoroHeatmapData {
  hourlyDistribution: Record<number, number>; // hour (0-23) -> count
  dailyDistribution: Record<string, number>; // YYYY-MM-DD -> count
  weekdayDistribution: Record<number, number>; // 0=Sunday, 6=Saturday -> count
  productiveHours: number[]; // Top 3 most productive hours
}

// Complete analytics data
export interface AdvancedAnalytics {
  dailyTrends: DailyDataPoint[]; // Last 30 days
  weeklyTrends: WeeklyTrend[]; // Last 12 weeks
  monthlyTrends: MonthlyTrend[]; // Last 6 months
  goalCompletionRate: GoalCompletionRate;
  pomodoroHeatmap: PomodoroHeatmapData;
}

// Export data types
export interface ExportData {
  exportDate: string; // ISO timestamp
  insights: InsightsData;
  analytics: AdvancedAnalytics;
  goals: Goal[];
  pomodoroSessions: PomodoroSession[];
  quotes: Quote[];
}
