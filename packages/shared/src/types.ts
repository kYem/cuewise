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

// Subtask - lightweight checklist item embedded within a task
export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
}

// Goal interface - supports both daily tasks and objectives
export interface Goal {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string; // ISO date string
  date: string; // YYYY-MM-DD (assignment date - the day this task belongs to)

  // Optional type - defaults to 'task' if not set (backward compatible)
  type?: GoalType;

  // Task-specific (optional)
  parentId?: string; // Links task to parent objective
  transferCount?: number; // Number of times goal was transferred to next day
  dueDate?: string; // YYYY-MM-DD deadline (distinct from date which is assignment date)
  sortOrder?: number; // Position within its list, 0-based
  subtasks?: Subtask[]; // Embedded checklist items within a task

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
export type ReminderFrequency = 'daily' | 'weekly' | 'monthly' | 'interval';

// Recurrence cadence. The union ties intervalMinutes to the 'interval' arm: an
// interval cadence always carries it; calendar cadences never do.
export type ReminderRecurrence =
  | { frequency: 'daily' | 'weekly' | 'monthly' }
  | { frequency: 'interval'; intervalMinutes: number };

// Reminder interface
export interface Reminder {
  id: string;
  text: string;
  dueDate: string; // ISO date string
  completed: boolean;
  notified: boolean;
  recurring?: ReminderRecurrence;
  paused?: boolean; // true when a recurring reminder is paused (won't fire)
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
  intervalMinutes?: number; // for 'interval' templates
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

// Posture tracking (macOS): a derived reading from the on-device posture sidecar.
// This is the integration contract — it mirrors PostureKit's `PostureSample` Swift
// struct verbatim. Never an image; only numbers. Optional metrics are absent when
// no face is detected (the Swift encoder omits nil keys).
export type PostureStatus = 'good' | 'mild' | 'poor' | 'absent';

export interface PostureSample {
  id: string;
  timestamp: string; // ISO-8601
  status: PostureStatus;
  present: boolean; // Was a face detected this tick?
  screenDistanceRatio?: number; // Face height / frame height; larger = closer
  neckDeviation?: number; // Signed deviation of the tech-neck metric from baseline (0 = baseline)
  headTiltDegrees?: number; // Head roll; chronic lean
}

// Customization types
export type ColorTheme = 'purple' | 'forest' | 'rose' | 'glass';
export type LayoutDensity = 'compact' | 'comfortable' | 'spacious';
export type SettingsLogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';
export type GoalViewMode = 'full' | 'compact' | 'focus';

// Where the calendar sits relative to goals when it's shown on the new tab.
export type NewTabCalendarPosition = 'above' | 'below';
export type TimeFormat = '12h' | '24h';
export type QuoteDisplayMode = 'normal' | 'compact' | 'bottom' | 'hidden';
export type ReminderPanelLayout = 'composed' | 'agenda';
export type FocusPosition = 'top' | 'center' | 'bottom';
// What shows beside the Pomodoro timer
export type PomodoroCompanion = 'quote' | 'calendar' | 'both';

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

// Quick link shortcut tile (pinned site on the new tab)
export interface QuickLink {
  id: string;
  title: string;
  url: string; // normalized absolute URL (http/https)
}

// Spaced-repetition (SM-2) schedule state for a concept card
export interface ConceptSchedule {
  dueDate: string; // yyyy-MM-dd — when the card next surfaces
  interval: number; // days until next review (0 = new/relearning)
  easeFactor: number; // SM-2 EF, starts 2.5, floor 1.3
  repetitions: number; // consecutive non-"again" reviews
  lapses: number; // times graded "again"
  lastReviewedAt?: string; // ISO timestamp of the last grade
}

// A user-created concept/definition card reviewed via active recall
export interface ConceptCard {
  id: string;
  term: string; // the prompt, e.g. "Saga pattern"
  definition: string; // the reveal/answer
  details?: string; // optional "how it works" / example
  tags?: string[]; // optional learning-topic grouping
  source?: string; // optional reference
  isFavorite?: boolean; // starred from the recall toolbar
  createdAt: string; // ISO
  schedule: ConceptSchedule;
}

// One day in the 7-day due forecast (index 0 = today, which also carries overdue)
export interface ConceptDueForecastDay {
  date: string; // YYYY-MM-DD
  count: number; // cards due that day
}

// Aggregate stats for a deck of concept cards (Insights view), derived from each
// card's schedule. newCount + learning + mastered === total.
export interface ConceptStats {
  total: number;
  due: number; // dueDate <= today (incl. overdue); equals dueForecast[0].count
  newCount: number; // never reviewed
  learning: number; // reviewed, interval < 21d (includes relearning)
  mastered: number; // interval >= 21d
  retentionPct: number | null; // 0-100 over reviewed cards; null when none reviewed
  avgEase: number | null; // mean ease over reviewed cards; null together with retentionPct
  needsAttention: ConceptCard[]; // lapses >= 2, sorted desc
  dueForecast: ConceptDueForecastDay[]; // 7 days starting today
}

export type ConceptGrade = 'again' | 'good' | 'easy';

// How often a due concept surfaces in the blended rotation ("1 in N tabs" feel)
export type ConceptCadence = 'every' | 'third' | 'ten' | 'off';
// Calm occasional nudge vs an explicit "N due today" review pile
export type ConceptFraming = 'ambient' | 'queue';
// A card's difficulty bucket for the deck UI (derived by getConceptDifficulty)
export type ConceptDifficulty = 'new' | 'struggling' | 'solid' | 'strong';

// Google Calendar (read-only) — shown beside the Pomodoro timer.
// Discriminated on `allDay` so the two time representations can't be confused:
// timed events carry full ISO datetimes (safe for `new Date(...)`), all-day
// events carry date-only YYYY-MM-DD strings (UTC-parsed — never feed them to
// `new Date()` as instants). Callers must narrow on `allDay` before reading the
// time fields, which makes that mistake unrepresentable.
interface CalendarEventBase {
  id: string;
  title: string;
  color?: string; // accent color (hex) for the strip
  htmlLink?: string; // link to the event in Google Calendar
}
export interface TimedCalendarEvent extends CalendarEventBase {
  allDay: false;
  start: string; // ISO datetime
  end: string; // ISO datetime
}
export interface AllDayCalendarEvent extends CalendarEventBase {
  allDay: true;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (exclusive)
}
export type CalendarEvent = TimedCalendarEvent | AllDayCalendarEvent;

// Persisted calendar connection + cached events
export interface CalendarState {
  connected: boolean;
  events: CalendarEvent[];
  lastSync: string | null; // ISO timestamp of the last fetch
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
  // Pomodoro companion (what shows beside the timer)
  pomodoroCompanion: PomodoroCompanion; // 'quote' | 'calendar' | 'both' (default 'quote')
  enableNotifications: boolean;
  theme: 'light' | 'dark' | 'auto';
  quoteChangeInterval: number; // seconds (0 = manual, 1-3600 = auto-refresh every N seconds)
  timeFormat: TimeFormat; // 12-hour (AM/PM) or 24-hour format
  syncEnabled: boolean; // Enable Chrome sync for cross-device synchronization (default false)
  // Customization
  colorTheme: ColorTheme;
  glassEnhanced: boolean; // Opt-in richer Glass surfaces: saturation, lit edges, legibility scrim (default false)
  layoutDensity: LayoutDensity;
  showThemeSwitcher: boolean; // Show live theme switcher sidebar
  showClock: boolean; // Show clock and date on home page (default false)
  showQuickLinks: boolean; // Show quick-link shortcut tiles top-left on home page (default true)
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
  newTabShowCalendar: boolean; // Show the calendar alongside goals on the new tab (default false)
  newTabCalendarPosition: NewTabCalendarPosition; // Calendar order vs goals when shown (default 'below')
  focusedGoalId: string | null; // Selected goal ID for focus mode (default null)
  showCompletedGoals: boolean; // Show completed tasks in Today's Focus list (default true)
  showIncompleteGoals: boolean; // Reveal the recent-incomplete backlog in the widget (default false)
  showUpcomingGoals: boolean; // Reveal the upcoming (due-soon) section in the widget (default false)
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
  // Celebrations
  celebrationsEnabled: boolean; // Play a Lottie burst on pomodoro/goal completion (default true)
  // Reminders
  reminderPanelLayout: ReminderPanelLayout; // Reminders panel layout (default 'composed')
  reminderPanelPinned: boolean; // Panel stays open: no click-away collapse; auto-expands once on load (default false)
  // Store review prompt
  reviewPromptDismissed: boolean; // Never surface the review prompt again (default false)
  reviewPromptCount: number; // Times the review prompt has been shown (default 0)
  reviewPromptLastShownAt: string | null; // yyyy-MM-dd day-string of the last show; drives the 7-day gap (default null)
  // Concept cards (spaced repetition)
  conceptCardsEnabled: boolean; // Master toggle; stays invisible until a card exists (default true)
  conceptCadence: ConceptCadence; // How often a due card surfaces in the rotation (default 'third')
  conceptFraming: ConceptFraming; // 'ambient' calm nudge vs 'queue' explicit due pile (default 'ambient')
  conceptActiveRecall: boolean; // Hide the definition until "Reveal" (true) vs show it upfront (default true)
  conceptNudgeDismissed: boolean; // Discovery nudge permanently dismissed (default false)
  conceptNudgeCount: number; // Times the discovery nudge has been shown (default 0)
  conceptNudgeLastShownAt: string | null; // yyyy-MM-dd of the last nudge show (default null)
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
  QUICK_LINKS: 'quickLinks', // Pinned shortcut tiles on the new tab
  CONCEPT_CARDS: 'conceptCards', // Spaced-repetition concept/definition cards
  CALENDAR: 'calendar', // Google Calendar connection + cached events
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

// Cloud sync wire types (ENG-43)
export interface PushRecord {
  collection: string;
  entityId: string;
  ciphertext: string;
  clientUpdatedAt: number;
  deleted: boolean;
}

export interface SyncRecord extends PushRecord {
  seq: number;
}

/** codeVerifier is required for apple (PKCE); google/dev exchanges don't use it. */
export type ExchangeTokenRequest =
  | { provider: 'google' | 'dev'; credential: string; deviceName: string }
  | { provider: 'apple'; credential: string; deviceName: string; codeVerifier: string };
