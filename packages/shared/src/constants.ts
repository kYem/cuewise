import type {
  ColorTheme,
  ConceptTemplate,
  FocusImageCategory,
  LayoutDensity,
  QuoteCategory,
  ReminderCategory,
  ReminderTemplate,
  Settings,
  SoundscapeTile,
  YoutubePlaylist,
} from './types';

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
  pomodoroCompanion: 'quote', // What shows beside the timer: quote | calendar | both
  enableNotifications: true,
  theme: 'auto',
  quoteChangeInterval: 10, // 0 = manual, 10+ = auto-refresh interval in seconds
  timeFormat: '12h',
  syncEnabled: false, // Disabled by default for privacy
  colorTheme: 'glass',
  glassEnhanced: false,
  layoutDensity: 'comfortable',
  showThemeSwitcher: false,
  showClock: false, // Clock hidden by default for simpler UI
  showQuickLinks: true, // Quick-link tiles shown by default
  enableGoalTransfer: true,
  goalTransferTime: 20, // 8 PM (20:00)
  logLevel: 'error', // Only show errors by default
  hasSeenOnboarding: false, // Show welcome modal on first visit
  // Focus Mode defaults
  focusModeEnabled: true, // Enable by default
  focusModeImageCategory: 'nature', // Nature photos by default
  focusModeShowQuote: true, // Show quote overlay
  focusModeAutoEnter: false, // Don't auto-enter (user choice)
  // Goal View Mode
  goalViewMode: 'full', // Full view by default
  newTabShowCalendar: false, // Calendar hidden on the new tab by default
  newTabCalendarPosition: 'below', // When shown, calendar sits below goals by default
  focusedGoalId: null, // No focused goal by default
  showCompletedGoals: true, // Show completed tasks in Today's Focus by default
  showIncompleteGoals: false, // Recent-incomplete backlog collapsed by default
  showUpcomingGoals: false, // Upcoming section collapsed by default
  // Quote Display
  quoteDisplayMode: 'bottom', // Show quotes below goals by default
  enableQuoteAnimation: false, // Disabled by default (can be CPU-intensive)
  celebrationsEnabled: true,
  // Reminders
  reminderPanelLayout: 'composed',
  reminderPanelPinned: false,
  // Focus Position
  focusPosition: 'center', // Center goals section by default
  // Quote Filter Persistence
  quoteFilterEnabledCategories: ALL_QUOTE_CATEGORIES,
  quoteFilterShowCustomQuotes: true,
  quoteFilterShowFavoritesOnly: false,
  quoteFilterActiveCollectionIds: [],
  // Store review prompt
  reviewPromptDismissed: false,
  reviewPromptCount: 0,
  reviewPromptLastShownAt: null,
  // Concept cards
  conceptCardsEnabled: true,
  conceptCadence: 'third',
  conceptFraming: 'ambient',
  conceptActiveRecall: true,
  conceptNudgeDismissed: false,
  conceptNudgeCount: 0,
  conceptNudgeLastShownAt: null,
};

/** Chrome Web Store reviews tab — where the in-app prompt sends users. */
export const REVIEW_URL =
  'https://chromewebstore.google.com/detail/cuewise/abjkbnhoepcnmbabflkedbapbldnpkbf/reviews';

/** Quick-link tiles shown inline before the overflow "more" dropdown. */
export const QUICK_LINKS_VISIBLE = 3;
/** Hard cap on total quick links a user can pin. */
export const QUICK_LINKS_MAX = 12;

/** Concept-card spaced-repetition (SM-2) bounds. */
export const CONCEPT_EASE_DEFAULT = 2.5;
export const CONCEPT_EASE_MIN = 1.3;
export const CONCEPT_INTERVAL_MAX = 365; // cap intervals at ~1 year so cards keep resurfacing

/** Concept-card discovery nudge: surfaces once the user is clearly engaged. */
export const CONCEPT_NUDGE_AFTER_QUOTE_VIEWS = 100;
export const CONCEPT_NUDGE_MAX_SHOWS = 2;
export const CONCEPT_NUDGE_GAP_DAYS = 3;

/** The four number-valued pomodoro rhythm keys — the bounded, clampable durations. */
export type NumericPomodoroKey = Extract<
  keyof Settings,
  | 'pomodoroWorkDuration'
  | 'pomodoroBreakDuration'
  | 'pomodoroLongBreakDuration'
  | 'pomodoroLongBreakInterval'
>;

/** Valid persisted ranges for the pomodoro rhythm settings. `satisfies` proves the
 * keys are real Settings keys; clampPomodoroDurations() enforces them at the write
 * boundary and the UI steppers mirror them. */
export const POMODORO_DURATION_BOUNDS = {
  pomodoroWorkDuration: { min: 1, max: 60 },
  pomodoroBreakDuration: { min: 1, max: 30 },
  pomodoroLongBreakDuration: { min: 10, max: 60 },
  pomodoroLongBreakInterval: { min: 2, max: 10 },
} as const satisfies Record<NumericPomodoroKey, { min: number; max: number }>;

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

// Soundscape tiles for the sounds panel (visual icon grid)
export const SOUNDSCAPE_TILES: SoundscapeTile[] = [
  { id: 'rain', name: 'Rain', icon: 'CloudRain' },
  { id: 'ocean', name: 'Ocean', icon: 'Waves' },
  { id: 'forest', name: 'Forest', icon: 'TreePine' },
  { id: 'cafe', name: 'Cafe', icon: 'Coffee' },
  { id: 'whiteNoise', name: 'White Noise', icon: 'Radio' },
  { id: 'brownNoise', name: 'Brown Noise', icon: 'Wind' },
];

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
    thumbnailUrl: 'https://i.ytimg.com/vi/k3WkJq478To/hqdefault.jpg',
    firstVideoId: 'k3WkJq478To',
    isCustom: false,
  },
  {
    id: 'chill-beats',
    name: 'Chill Beats',
    playlistId: 'PLXIclLvfETS3AgCnZg4N6QqHu_T27XKIq',
    thumbnailUrl: 'https://i.ytimg.com/vi/A7uNvvAKsYU/hqdefault.jpg',
    firstVideoId: 'A7uNvvAKsYU',
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
    playlistId: 'PLNIOIzEHtNJbXCOTAlbxazG1MwruX0Rg5',
    thumbnailUrl: 'https://i.ytimg.com/vi/1x_x3hC1e04/hqdefault.jpg',
    firstVideoId: '1x_x3hC1e04',
    isCustom: false,
  },
  {
    id: 'nature-sounds',
    name: 'Nature Sounds',
    playlistId: 'PLMA7kfAr6g5Hvae_IJi74x57ONAx9Wvet',
    thumbnailUrl: 'https://i.ytimg.com/vi/BnyLOcChdzk/hqdefault.jpg',
    firstVideoId: 'BnyLOcChdzk',
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

/** Accent color per reminder category, for the redesigned reminder panels. */
export const REMINDER_CATEGORY_META: Record<ReminderCategory, { color: string }> = {
  health: { color: '#34d399' },
  productivity: { color: '#60a5fa' },
  personal: { color: '#c4b5fd' },
};

// Built-in reminder templates for quick creation
export const REMINDER_TEMPLATES: ReminderTemplate[] = [
  // Health & Wellness
  {
    id: 'move',
    name: 'Move',
    text: 'Time to move — stretch or take a short walk 🚶',
    defaultTime: '09:30',
    frequency: 'interval',
    category: 'health',
    intervalMinutes: 30,
  },
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

// Movement / interval reminder cadence (minutes)
export const REMINDER_INTERVAL_MIN = 1;
export const REMINDER_INTERVAL_MAX = 480; // 8 hours
export const DEFAULT_REMINDER_INTERVAL_MINUTES = 30;
export const REMINDER_INTERVAL_PRESETS = [30, 45, 60, 90] as const;

// Minutes a reminder notification's "Snooze" button defers the next alarm.
export const REMINDER_SNOOZE_MINUTES = 5;

// Curated concept-card starter packs — each is ~10 common terms for a topic,
// added in one click and tagged so they group cleanly in the deck. Content is
// intentionally concise (one or two sentences) to match the recall UI. Users
// edit or delete any card afterwards; re-adding a pack skips cards already saved.
export const CONCEPT_TEMPLATES: ConceptTemplate[] = [
  {
    id: 'system-design',
    name: 'System Design',
    description: 'Core building blocks for scalable backend systems.',
    tag: 'system-design',
    cards: [
      {
        term: 'Load balancer',
        definition:
          'A component that distributes incoming requests across multiple servers to spread load and avoid any single instance becoming a bottleneck.',
        details: 'Common strategies: round-robin, least-connections, and IP-hash.',
      },
      {
        term: 'Horizontal vs vertical scaling',
        definition:
          'Horizontal scaling adds more machines; vertical scaling adds more power (CPU/RAM) to one machine.',
        details:
          'Horizontal scales further but needs statelessness; vertical is simpler but capped.',
      },
      {
        term: 'Caching',
        definition:
          'Storing the result of an expensive operation so future requests for the same data are served faster.',
        details: 'Watch for staleness — invalidation is one of the hard problems.',
      },
      {
        term: 'CAP theorem',
        definition:
          'A distributed store can guarantee at most two of Consistency, Availability, and Partition tolerance at once.',
        details:
          'Since partitions are unavoidable, the real trade-off is C vs A during a partition.',
      },
      {
        term: 'Sharding',
        definition:
          'Splitting a database horizontally across nodes by a shard key so no single node holds all the data.',
        details: 'A poorly chosen shard key creates hot spots.',
      },
      {
        term: 'Message queue',
        definition:
          'A buffer that decouples producers from consumers, letting work be processed asynchronously and absorb spikes.',
        details: 'Examples: Kafka, RabbitMQ, SQS.',
      },
      {
        term: 'Idempotency',
        definition:
          'A property where making the same request multiple times has the same effect as making it once.',
        details: 'Essential for safe retries in distributed systems.',
      },
      {
        term: 'Rate limiting',
        definition:
          'Capping how many requests a client can make in a time window to protect a service from overload or abuse.',
        details: 'Token bucket and sliding window are common algorithms.',
      },
      {
        term: 'CDN',
        definition:
          'A geographically distributed network of servers that caches static content close to users to cut latency.',
      },
      {
        term: 'Consistent hashing',
        definition:
          'A hashing scheme that minimizes the number of keys that must move when nodes are added or removed.',
        details: 'Used to distribute cache keys and shards with minimal reshuffling.',
      },
    ],
  },
  {
    id: 'javascript',
    name: 'JavaScript & TypeScript',
    description: 'Language fundamentals every JS/TS developer leans on.',
    tag: 'javascript',
    cards: [
      {
        term: 'Closure',
        definition:
          'A function bundled together with references to the variables from the scope where it was defined, so it keeps access to them after that scope returns.',
      },
      {
        term: 'Event loop',
        definition:
          'The mechanism that lets single-threaded JavaScript run non-blocking async code by processing queued callbacks once the call stack is empty.',
        details: 'Microtasks (promises) run before macrotasks (timers).',
      },
      {
        term: 'Hoisting',
        definition:
          'JavaScript moves declarations to the top of their scope at compile time; `var` initializes to undefined, while `let`/`const` stay in the temporal dead zone.',
      },
      {
        term: 'Promise',
        definition:
          'An object representing the eventual result of an async operation, which can be pending, fulfilled, or rejected.',
      },
      {
        term: 'this binding',
        definition:
          "The value of `this` depends on how a function is called, not where it's defined; arrow functions instead capture `this` from their enclosing scope.",
      },
      {
        term: 'Prototypal inheritance',
        definition:
          'Objects delegate to a prototype object for properties they lack, forming a prototype chain used for lookups.',
      },
      {
        term: 'Structural typing',
        definition:
          "TypeScript checks type compatibility by an object's shape rather than its declared name — if it has the required members, it fits.",
      },
      {
        term: 'Union vs intersection types',
        definition:
          'A union (`A | B`) is one of several types; an intersection (`A & B`) combines all their members into one.',
      },
      {
        term: 'Generics',
        definition:
          'Type parameters that let a function or type work over many types while preserving the relationship between inputs and outputs.',
      },
      {
        term: 'Type narrowing',
        definition:
          'Refining a broad type to a more specific one within a branch using checks like `typeof`, `in`, or truthiness guards.',
      },
    ],
  },
  {
    id: 'cognitive-biases',
    name: 'Cognitive Biases',
    description: 'Common thinking traps worth recognizing in yourself.',
    tag: 'psychology',
    cards: [
      {
        term: 'Confirmation bias',
        definition:
          'The tendency to seek, interpret, and remember information in a way that confirms what you already believe.',
      },
      {
        term: 'Anchoring',
        definition:
          'Relying too heavily on the first piece of information encountered when making a decision.',
        details: 'The initial price in a negotiation anchors everything that follows.',
      },
      {
        term: 'Sunk cost fallacy',
        definition:
          'Continuing an endeavor because of already-invested resources rather than future value.',
      },
      {
        term: 'Availability heuristic',
        definition:
          'Judging how likely something is by how easily examples come to mind, which overweights vivid or recent events.',
      },
      {
        term: 'Dunning–Kruger effect',
        definition:
          'People with low competence in an area tend to overestimate their ability, lacking the skill to see their own gaps.',
      },
      {
        term: 'Survivorship bias',
        definition:
          'Focusing on the things that made it past a selection while ignoring those that did not, skewing conclusions.',
      },
      {
        term: 'Loss aversion',
        definition:
          'The pain of losing something is felt roughly twice as strongly as the pleasure of gaining the equivalent.',
      },
      {
        term: 'Hindsight bias',
        definition: 'After an event, seeing it as having been predictable all along ("I knew it").',
      },
      {
        term: 'Fundamental attribution error',
        definition:
          "Attributing others' behavior to their character while attributing your own to circumstances.",
      },
      {
        term: 'Framing effect',
        definition:
          'Reaching different conclusions from the same information depending on how it is presented.',
        details: '"90% survival" feels better than "10% mortality" for identical odds.',
      },
    ],
  },
  {
    id: 'productivity',
    name: 'Productivity & Focus',
    description: 'Methods and ideas for doing meaningful work.',
    tag: 'productivity',
    cards: [
      {
        term: 'Pomodoro Technique',
        definition:
          'Working in focused ~25-minute intervals separated by short breaks to sustain concentration.',
      },
      {
        term: 'Deep work',
        definition:
          'Distraction-free concentration on a cognitively demanding task, where the most valuable output tends to happen.',
      },
      {
        term: 'Eisenhower Matrix',
        definition:
          'Sorting tasks by urgency and importance into four quadrants to decide what to do, schedule, delegate, or drop.',
      },
      {
        term: 'Parkinson’s Law',
        definition:
          'Work expands to fill the time available for its completion — so tighter deadlines can sharpen focus.',
      },
      {
        term: 'Time blocking',
        definition:
          'Assigning specific tasks to specific blocks on your calendar rather than working from an open to-do list.',
      },
      {
        term: 'Eat the frog',
        definition:
          'Do your most important or dreaded task first thing, before the day erodes your energy and attention.',
      },
      {
        term: 'Two-minute rule',
        definition:
          'If a task takes less than two minutes, do it immediately instead of tracking it for later.',
      },
      {
        term: 'Pareto principle',
        definition:
          'Roughly 80% of results come from 20% of causes — focus effort on the vital few.',
      },
      {
        term: 'Context switching cost',
        definition: 'The hidden time and focus lost each time you jump between unrelated tasks.',
      },
      {
        term: 'Getting Things Done (GTD)',
        definition:
          'A method of capturing every task in a trusted external system so your mind is free to focus on doing.',
      },
    ],
  },
  {
    id: 'statistics',
    name: 'Statistics & Data',
    description: 'Concepts for reasoning about data and uncertainty.',
    tag: 'statistics',
    cards: [
      {
        term: 'Mean vs median',
        definition:
          'The mean is the average; the median is the middle value. The median is more robust to outliers.',
      },
      {
        term: 'Standard deviation',
        definition:
          'A measure of how spread out values are around the mean — larger means more variability.',
      },
      {
        term: 'p-value',
        definition:
          'The probability of observing a result at least as extreme as yours if the null hypothesis were true.',
        details:
          'A small p-value suggests the data is unlikely under the null — not that the effect is large.',
      },
      {
        term: 'Correlation vs causation',
        definition:
          'Two variables moving together does not mean one causes the other; a hidden factor may drive both.',
      },
      {
        term: 'Normal distribution',
        definition:
          'A symmetric bell-shaped distribution where most values cluster near the mean; many natural measures approximate it.',
      },
      {
        term: 'Sampling bias',
        definition:
          'When the sample collected is not representative of the population, distorting conclusions.',
      },
      {
        term: 'Regression to the mean',
        definition:
          'Extreme measurements tend to be followed by ones closer to the average on remeasurement.',
      },
      {
        term: 'Confidence interval',
        definition:
          'A range of values that, under repeated sampling, would contain the true parameter a stated percentage of the time.',
      },
      {
        term: 'Overfitting',
        definition:
          'A model that captures noise in its training data and therefore generalizes poorly to new data.',
      },
      {
        term: 'Base rate',
        definition:
          'The underlying prevalence of something in a population — ignoring it leads to the base rate fallacy.',
      },
    ],
  },
  {
    id: 'personal-finance',
    name: 'Personal Finance',
    description: 'Everyday money concepts worth internalizing.',
    tag: 'finance',
    cards: [
      {
        term: 'Compound interest',
        definition:
          'Earning interest on both your principal and previously accumulated interest, so growth accelerates over time.',
      },
      {
        term: 'Emergency fund',
        definition:
          'Cash set aside (often 3–6 months of expenses) to cover unexpected costs without taking on debt.',
      },
      {
        term: 'Diversification',
        definition:
          'Spreading investments across assets so a loss in one is cushioned by others, reducing overall risk.',
      },
      {
        term: 'Index fund',
        definition:
          'A fund that tracks a market index, offering broad diversification at low cost with minimal active management.',
      },
      {
        term: 'Inflation',
        definition:
          'The general rise in prices over time, which erodes the purchasing power of money held in cash.',
      },
      {
        term: 'Net worth',
        definition: 'Everything you own (assets) minus everything you owe (liabilities).',
      },
      {
        term: 'APR vs APY',
        definition:
          'APR is the annual rate without compounding; APY includes the effect of compounding, so it reflects true yearly cost or return.',
      },
      {
        term: 'Asset vs liability',
        definition:
          'An asset puts money in your pocket or holds value; a liability takes money out through payments or interest.',
      },
      {
        term: 'Dollar-cost averaging',
        definition:
          'Investing a fixed amount at regular intervals regardless of price, smoothing out the effect of volatility.',
      },
      {
        term: 'Opportunity cost',
        definition:
          'The value of the next-best option you give up when you choose to spend money or time one way.',
      },
    ],
  },
  {
    id: 'web-security',
    name: 'Web Security',
    description: 'Common web attacks and the defenses against them.',
    tag: 'security',
    cards: [
      {
        term: 'XSS (Cross-Site Scripting)',
        definition:
          'An attack where malicious scripts are injected into pages viewed by other users, running in their browser context.',
        details: 'Defend by escaping output and using a Content Security Policy.',
      },
      {
        term: 'CSRF (Cross-Site Request Forgery)',
        definition:
          "Tricking a logged-in user's browser into making an unwanted authenticated request to a site.",
        details: 'Mitigated with anti-CSRF tokens and SameSite cookies.',
      },
      {
        term: 'SQL injection',
        definition:
          'Injecting malicious SQL through unsanitized input to read or modify the database.',
        details: 'Prevented by parameterized queries / prepared statements.',
      },
      {
        term: 'Hashing vs encryption',
        definition:
          'Hashing is a one-way transform used for passwords; encryption is reversible with a key for protecting data in transit or at rest.',
      },
      {
        term: 'Salting',
        definition:
          'Adding a unique random value to each password before hashing so identical passwords produce different hashes and rainbow tables fail.',
      },
      {
        term: 'HTTPS / TLS',
        definition:
          'A protocol that encrypts traffic between client and server and authenticates the server via certificates.',
      },
      {
        term: 'Principle of least privilege',
        definition:
          'Granting each user or process only the minimum access needed to do its job, limiting blast radius if compromised.',
      },
      {
        term: 'Authentication vs authorization',
        definition:
          'Authentication verifies who you are; authorization determines what you are allowed to do.',
      },
      {
        term: 'CORS',
        definition:
          'A browser mechanism that uses server headers to control which cross-origin sites may read a response.',
      },
      {
        term: 'Man-in-the-middle attack',
        definition:
          'An attacker secretly relays or alters communication between two parties who believe they talk directly.',
      },
    ],
  },
  {
    id: 'networking',
    name: 'Networking & the Web',
    description: 'How data moves across the internet.',
    tag: 'networking',
    cards: [
      {
        term: 'TCP vs UDP',
        definition:
          'TCP is connection-oriented and reliable with ordered delivery; UDP is connectionless and faster but makes no delivery guarantees.',
      },
      {
        term: 'DNS',
        definition:
          'The system that translates human-readable domain names into the IP addresses machines route to.',
      },
      {
        term: 'HTTP status codes',
        definition:
          'Three-digit codes signaling a response outcome: 2xx success, 3xx redirect, 4xx client error, 5xx server error.',
      },
      {
        term: 'REST',
        definition:
          'An architectural style for APIs using stateless HTTP methods (GET, POST, PUT, DELETE) over resource URLs.',
      },
      {
        term: 'IP address',
        definition:
          'A numerical label identifying a device on a network; IPv4 uses 32 bits, IPv6 uses 128 bits.',
      },
      {
        term: 'Latency vs bandwidth',
        definition:
          'Latency is the delay before data transfers; bandwidth is how much data can transfer per unit of time.',
      },
      {
        term: 'Ports',
        definition:
          'Numbered endpoints on a host that let one machine run many networked services (e.g. 80 for HTTP, 443 for HTTPS).',
      },
      {
        term: 'TCP handshake',
        definition:
          'The three-step SYN → SYN-ACK → ACK exchange that establishes a reliable TCP connection.',
      },
      {
        term: 'WebSocket',
        definition:
          'A protocol providing a persistent, full-duplex connection over a single TCP link, used for real-time updates.',
      },
      {
        term: 'Packet',
        definition:
          'A small unit of data with a header and payload that is routed independently across a network and reassembled at the destination.',
      },
    ],
  },
  {
    id: 'machine-learning',
    name: 'Machine Learning',
    description: 'Foundational ideas behind ML models.',
    tag: 'machine-learning',
    cards: [
      {
        term: 'Supervised vs unsupervised learning',
        definition:
          'Supervised learning trains on labeled examples; unsupervised learning finds structure in unlabeled data.',
      },
      {
        term: 'Training vs test set',
        definition:
          'The training set fits the model; the held-out test set estimates how well it generalizes to unseen data.',
      },
      {
        term: 'Overfitting vs underfitting',
        definition:
          'Overfitting memorizes noise and fails on new data; underfitting is too simple to capture the real pattern.',
      },
      {
        term: 'Gradient descent',
        definition:
          'An optimization method that iteratively adjusts parameters in the direction that most reduces the loss.',
      },
      {
        term: 'Loss function',
        definition: 'A measure of how wrong a model’s predictions are; training minimizes it.',
      },
      {
        term: 'Neural network',
        definition:
          'A model of layered interconnected nodes that learns weighted transformations of its inputs.',
      },
      {
        term: 'Feature',
        definition: 'An individual measurable input variable the model uses to make predictions.',
      },
      {
        term: 'Classification vs regression',
        definition:
          'Classification predicts discrete categories; regression predicts continuous numeric values.',
      },
      {
        term: 'Bias–variance tradeoff',
        definition:
          'Simpler models have high bias (underfit); complex ones have high variance (overfit). Good models balance the two.',
      },
      {
        term: 'Overfitting remedy: regularization',
        definition:
          'Adding a penalty on model complexity (e.g. L1/L2) to discourage overfitting and improve generalization.',
      },
    ],
  },
  {
    id: 'ux-design',
    name: 'Design & UX',
    description: 'Principles behind interfaces that feel right.',
    tag: 'design',
    cards: [
      {
        term: 'Affordance',
        definition:
          'A property that signals how an object can be used — a button that looks pressable invites a click.',
      },
      {
        term: 'Hick’s Law',
        definition:
          'The time to make a decision grows with the number and complexity of choices offered.',
      },
      {
        term: 'Fitts’s Law',
        definition:
          'The time to reach a target depends on its distance and size — bigger, closer targets are faster to hit.',
      },
      {
        term: 'Visual hierarchy',
        definition:
          'Arranging elements by size, color, and placement so the eye is guided to what matters most first.',
      },
      {
        term: 'Contrast (accessibility)',
        definition:
          'Sufficient difference between text and background luminance so content is legible; WCAG sets minimum ratios.',
      },
      {
        term: 'Consistency',
        definition:
          'Reusing patterns, wording, and controls so users can transfer what they learned across the product.',
      },
      {
        term: 'Feedback',
        definition:
          'Immediate, clear responses to user actions so people know a system received and understood their input.',
      },
      {
        term: 'Progressive disclosure',
        definition:
          'Showing only what’s needed now and revealing advanced options on demand to reduce overwhelm.',
      },
      {
        term: 'White space',
        definition:
          'Empty space around elements that improves readability, grouping, and focus — not wasted space.',
      },
      {
        term: 'Gestalt proximity',
        definition: 'People perceive elements placed close together as a related group.',
      },
    ],
  },
];
