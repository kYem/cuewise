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
  collectionIds?: string[]; // Collections this quote belongs to
}

// Quote collection for organizing quotes
export interface QuoteCollection {
  id: string;
  name: string;
  description?: string;
  createdAt: string; // ISO date string
  updatedAt?: string; // ISO date string
}

// Goal type - 'task' (default) or 'objective' for longer-term goals
export type GoalType = 'task' | 'objective';

// Goal interface - supports both daily tasks and objectives
export interface Goal {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string; // ISO date string
  date: string; // YYYY-MM-DD (due date for both tasks and objectives)

  // Optional type - defaults to 'task' if not set (backward compatible)
  type?: GoalType;

  // Task-specific (optional)
  parentId?: string; // Links task to parent objective
  transferCount?: number; // Number of times goal was transferred to next day

  // Objective-specific (optional)
  description?: string; // Longer description for objectives
}

// Goal progress information
export interface GoalProgress {
  total: number;
  completed: number;
  percent: number;
  tasks: Goal[];
  daysRemaining: number | null;
  isOverdue: boolean;
}

// Reminder category for templates and context-aware suggestions
export type ReminderCategory = 'health' | 'productivity' | 'personal';

// Reminder frequency for recurring reminders and templates
export type ReminderFrequency = 'daily' | 'weekly' | 'monthly';

// Reminder interface
export interface Reminder {
  id: string;
  text: string;
  dueDate: string; // ISO date string
  completed: boolean;
  notified: boolean;
  recurring?: {
    frequency: ReminderFrequency;
    enabled: boolean;
  };
  // Context-aware suggestions
  category?: ReminderCategory; // Optional category for suggestions
  completedAt?: string; // ISO timestamp when marked complete (for suggestions)
}

// Reminder template for quick creation
export interface ReminderTemplate {
  id: string;
  name: string;
  text: string;
  defaultTime: string; // HH:MM format (e.g., "09:00")
  frequency: ReminderFrequency;
  category: ReminderCategory;
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
export type ColorTheme = 'purple' | 'forest' | 'rose' | 'glass';
export type LayoutDensity = 'compact' | 'comfortable' | 'spacious';
export type SettingsLogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';
export type GoalViewMode = 'full' | 'compact' | 'focus';
export type TimeFormat = '12h' | '24h';
export type QuoteDisplayMode = 'normal' | 'compact' | 'bottom' | 'hidden';
export type FocusPosition = 'top' | 'center' | 'bottom';

// Focus mode image categories for Unsplash backgrounds
export type FocusImageCategory = 'nature' | 'forest' | 'ocean' | 'mountains' | 'minimal' | 'dark';

// YouTube playlist for Pomodoro music
export interface YoutubePlaylist {
  id: string; // Unique ID (generated for custom, fixed for curated)
  name: string; // Display name
  playlistId: string; // YouTube playlist ID (e.g., "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")
  thumbnailUrl?: string; // Optional thumbnail URL
  firstVideoId?: string; // First video ID for embedding (YouTube requires video ID + list for embeds)
  isCustom: boolean; // User-added vs pre-built curated playlist
}

// YouTube video progress for timestamp memory
export interface VideoProgress {
  videoId: string; // YouTube video ID
  timestamp: number; // Playback position in seconds
  updatedAt: string; // ISO timestamp of last update
}

// YouTube playlist progress (tracks current video and timestamps)
export interface PlaylistProgress {
  playlistId: string; // YouTube playlist ID
  currentVideoId?: string; // Currently playing video ID
  videoProgress: VideoProgress[]; // Timestamps for videos in this playlist
}

// Sound source type (mutually exclusive - only one can play at a time)
export type SoundSource = 'none' | 'ambient' | 'youtube';

// Soundscape tile configuration for the sounds panel
export interface SoundscapeTile {
  id: string; // Matches AmbientSoundType (e.g., 'rain', 'ocean')
  name: string; // Display name
  icon: string; // Lucide icon name
}

// Settings interface
export interface Settings {
  pomodoroWorkDuration: number; // minutes (default 25)
  pomodoroBreakDuration: number; // minutes (default 5)
  pomodoroLongBreakDuration: number; // minutes (default 15)
  pomodoroLongBreakInterval: number; // number of work sessions before long break (default 4)
  pomodoroAutoStartBreaks: boolean; // auto-cycle between work and breaks continuously (default true)
  pomodoroAmbientSound: string; // ambient sound type (default 'none')
  pomodoroAmbientVolume: number; // volume 0-100 (default 50)
  pomodoroStartSound: string; // notification sound for session start (default 'chime')
  pomodoroCompletionSound: string; // notification sound for session completion (default 'chime')
  // Pomodoro Music (YouTube integration)
  pomodoroMusicEnabled: boolean; // Enable YouTube music integration (default false)
  pomodoroMusicVolume: number; // volume 0-100 (default 50)
  pomodoroMusicAutoStart: boolean; // Auto-play music when timer starts (default true)
  pomodoroMusicPlaylistId: string; // Selected playlist ID (default '')
  pomodoroMusicPlayDuringBreaks: boolean; // Continue music during breaks (default false)
  enableNotifications: boolean;
  theme: 'light' | 'dark' | 'auto';
  quoteChangeInterval: number; // seconds (0 = manual, 1-3600 = auto-refresh every N seconds)
  timeFormat: TimeFormat; // 12-hour (AM/PM) or 24-hour format
  syncEnabled: boolean; // Enable Chrome sync for cross-device synchronization (default false)
  // Customization
  colorTheme: ColorTheme;
  layoutDensity: LayoutDensity;
  showThemeSwitcher: boolean; // Show live theme switcher sidebar
  showClock: boolean; // Show clock and date on home page (default false)
  // Goal Transfer
  enableGoalTransfer: boolean; // Enable goal transfer feature (default true)
  goalTransferTime: number; // Hour (0-23) when transfer button appears (default 20 for 8 PM)
  // Debug
  logLevel: SettingsLogLevel; // Console log level (default 'error')
  // Onboarding
  hasSeenOnboarding: boolean; // Has user seen the welcome modal (default false)
  // Focus Mode
  focusModeEnabled: boolean; // Enable focus mode feature (default true)
  focusModeImageCategory: FocusImageCategory; // Background image category (default 'nature')
  focusModeShowQuote: boolean; // Show motivational quote overlay (default true)
  focusModeAutoEnter: boolean; // Auto-enter focus mode when timer starts (default false)
  // Goal View Mode
  goalViewMode: GoalViewMode; // View mode for Today's Focus section (default 'full')
  focusedGoalId: string | null; // Selected goal ID for focus mode (default null)
  // Quote Display
  quoteDisplayMode: QuoteDisplayMode; // How quotes are displayed on home page (default 'bottom')
  enableQuoteAnimation: boolean; // Enable smart-ticker animation for quotes (default false)
  // Focus Position
  focusPosition: FocusPosition; // Vertical position of focus/goals section (default 'center')
  // Quote Filter Persistence
  quoteFilterEnabledCategories: QuoteCategory[]; // Enabled categories for quote filter (default all)
  quoteFilterShowCustomQuotes: boolean; // Show custom quotes in filter (default true)
  quoteFilterShowFavoritesOnly: boolean; // Show only favorites (default false)
  quoteFilterActiveCollectionIds: string[]; // Active collection IDs for filter (default [])
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
  CUSTOM_YOUTUBE_PLAYLISTS: 'customYoutubePlaylists', // User-added YouTube playlists
  YOUTUBE_PROGRESS: 'youtubeProgress', // YouTube playback progress (timestamps per video)
  DAILY_BACKGROUND: 'dailyBackground', // Daily background image (changes once per day)
  COLLECTIONS: 'collections', // Quote collections
} as const;

// Daily background image data (persisted to change only once per day)
export interface DailyBackground {
  url: string;
  category: FocusImageCategory;
  date: string; // YYYY-MM-DD format
}

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
  // Objective analytics
  activeGoals: number;
  objectivesCompletedThisMonth: number;
  avgGoalProgress: number; // 0-100 percentage
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

// Export/Import metadata
export interface ExportMetadata {
  version: string; // App version that created the export (e.g., "1.2.0")
  formatVersion: number; // Data format version for compatibility (starts at 1)
  exportDate: string; // ISO timestamp
}

/**
 * Current export format version for forward compatibility.
 * Increment when making changes that older app versions cannot safely import
 * (e.g., new required fields, schema changes).
 * The app will reject imports with formatVersion > EXPORT_FORMAT_VERSION.
 */
export const EXPORT_FORMAT_VERSION = 1;

// Export data types
export interface ExportData extends ExportMetadata {
  insights: InsightsData | null;
  analytics: AdvancedAnalytics | null;
  goals: Goal[];
  pomodoroSessions: PomodoroSession[];
  quotes: Quote[];
}

// Import result types
export interface ImportValidationError {
  field: string;
  message: string;
}

export interface ImportResult {
  success: boolean;
  imported: {
    goals: number;
    quotes: number;
    pomodoroSessions: number;
  };
  skipped: {
    goals: number;
    quotes: number;
    pomodoroSessions: number;
  };
  errors: ImportValidationError[];
}

// Import options
export interface ImportOptions {
  importGoals: boolean;
  importQuotes: boolean;
  importPomodoroSessions: boolean;
  skipDuplicates: boolean; // Skip items with matching IDs
}

// CSV Import types for bulk quote import
export interface CSVQuoteRow {
  text: string;
  author: string;
  category?: QuoteCategory;
  source?: string;
  notes?: string;
}

export interface CSVParseError {
  row: number;
  message: string;
}

export interface CSVParseResult {
  valid: CSVQuoteRow[];
  errors: CSVParseError[];
  warnings: string[];
}

export interface BulkImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
}
