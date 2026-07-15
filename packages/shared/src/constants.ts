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

/** 24 hours in ms — use for day arithmetic instead of inline literals. */
export const DAY_IN_MS = 24 * 60 * 60 * 1000;

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
  autoRollDueTasks: true,
  logLevel: 'error', // Only show errors by default
  hasSeenOnboarding: false, // Show welcome modal on first visit
  // Focus Mode defaults
  focusModeEnabled: true, // Enable by default
  focusModeImageCategory: 'nature', // Nature photos by default
  focusModeShowQuote: true, // Show quote overlay
  focusModeShowGoal: true, // "Focusing on" line under the timer
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
    id: 'study-skills',
    name: 'Study Skills',
    description: 'Evidence-based techniques for learning that sticks.',
    tag: 'study-skills',
    cards: [
      {
        term: 'Active recall',
        definition:
          'Testing yourself to pull information from memory, which strengthens it far more than rereading.',
        details: 'Flashcards and practice questions beat highlighting.',
      },
      {
        term: 'Spaced repetition',
        definition:
          'Reviewing material at increasing intervals so you relearn it just before you would forget.',
      },
      {
        term: 'The Pomodoro Technique',
        definition:
          'Studying in focused ~25-minute blocks with short breaks to sustain concentration.',
      },
      {
        term: 'Interleaving',
        definition:
          'Mixing different topics or problem types in one session instead of practicing one thing at a time.',
        details: 'It feels harder but improves your ability to tell problems apart.',
      },
      {
        term: 'The Feynman Technique',
        definition:
          'Explaining a concept in plain language as if teaching it, to expose the gaps in your understanding.',
      },
      {
        term: 'Elaboration',
        definition:
          'Connecting new information to what you already know and asking "why" and "how" to deepen memory.',
      },
      {
        term: 'Dual coding',
        definition:
          'Pairing words with visuals — diagrams, timelines, sketches — so ideas are stored two ways.',
      },
      {
        term: 'Cramming vs distributed practice',
        definition:
          'Massed cramming helps a test tomorrow but fades fast; spreading study over days retains far more.',
      },
      {
        term: 'Metacognition',
        definition:
          'Thinking about your own thinking — judging what you do and don’t know so you study the right things.',
      },
      {
        term: 'Retrieval practice',
        definition:
          'Deliberately recalling learned material without looking, the single most effective study habit.',
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
        term: 'Budget',
        definition:
          'A plan that assigns your income to spending, saving, and goals so you know where your money goes.',
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
        term: 'Interest on debt',
        definition:
          'The extra cost of borrowing; high-interest debt like credit cards can grow faster than savings can keep up.',
      },
      {
        term: 'Diversification',
        definition:
          'Spreading money across different investments so a loss in one is cushioned by others.',
      },
      {
        term: 'Needs vs wants',
        definition:
          'Distinguishing essentials (rent, food) from discretionary spending to prioritize when money is tight.',
      },
      {
        term: 'Credit score',
        definition:
          'A number summarizing how reliably you repay debt, affecting loans, rent, and interest rates you are offered.',
      },
      {
        term: 'Opportunity cost',
        definition:
          'The value of the next-best option you give up when you choose to spend money or time one way.',
      },
    ],
  },
  {
    id: 'world-geography',
    name: 'World Geography',
    description: 'Places, features, and terms to know the world by.',
    tag: 'geography',
    cards: [
      {
        term: 'Continent',
        definition:
          'One of Earth’s seven large landmasses: Africa, Antarctica, Asia, Europe, North America, Oceania, and South America.',
      },
      {
        term: 'Equator',
        definition:
          'The imaginary line at 0° latitude circling the middle of Earth, dividing it into the Northern and Southern hemispheres.',
      },
      {
        term: 'Latitude vs longitude',
        definition:
          'Latitude measures distance north–south of the equator; longitude measures east–west of the prime meridian.',
      },
      {
        term: 'Longest river',
        definition:
          'The Nile in Africa and the Amazon in South America are the two longest rivers, each roughly 6,600 km.',
      },
      {
        term: 'Largest ocean',
        definition:
          'The Pacific Ocean is the largest and deepest, covering about a third of Earth’s surface.',
      },
      {
        term: 'Tectonic plates',
        definition:
          'Large slabs of Earth’s crust that slowly move; their boundaries cause earthquakes, volcanoes, and mountains.',
      },
      {
        term: 'Climate vs weather',
        definition:
          'Weather is the day-to-day state of the atmosphere; climate is the average pattern over decades.',
      },
      {
        term: 'Capital city',
        definition:
          'The city where a country’s government is seated — not always its largest (e.g. Canberra, not Sydney).',
      },
      {
        term: 'Time zones',
        definition:
          'Regions that share a standard time, roughly one per 15° of longitude, set relative to UTC.',
      },
      {
        term: 'Desert',
        definition:
          'A region receiving very little precipitation; the Sahara is the largest hot desert, Antarctica the largest cold one.',
      },
    ],
  },
  {
    id: 'world-history',
    name: 'World History',
    description: 'Turning points that shaped the modern world.',
    tag: 'history',
    cards: [
      {
        term: 'The Agricultural Revolution',
        definition:
          'The shift ~10,000 years ago from hunting and gathering to farming, which enabled permanent settlements and cities.',
      },
      {
        term: 'Ancient Rome',
        definition:
          'A civilization that grew from a city to an empire ruling the Mediterranean, shaping law, language, and government.',
      },
      {
        term: 'The Renaissance',
        definition:
          'A revival of art, science, and learning in Europe from the 14th–17th centuries, rooted in classical ideas.',
      },
      {
        term: 'The printing press',
        definition:
          'Gutenberg’s ~1440 movable-type press that made books cheap and spread literacy and ideas rapidly.',
      },
      {
        term: 'The Industrial Revolution',
        definition:
          'The 18th–19th century move to machine manufacturing, transforming economies, cities, and daily life.',
      },
      {
        term: 'The Enlightenment',
        definition:
          'An 18th-century movement emphasizing reason, science, and individual rights that influenced modern democracies.',
      },
      {
        term: 'World War I & II',
        definition:
          'Two global conflicts (1914–1918 and 1939–1945) that reshaped borders, alliances, and the balance of world power.',
      },
      {
        term: 'The Cold War',
        definition:
          'A decades-long rivalry after 1945 between the US-led West and Soviet-led East, without direct large-scale war.',
      },
      {
        term: 'Decolonization',
        definition:
          'The mid-20th-century process by which many colonies in Africa and Asia gained independence.',
      },
      {
        term: 'Primary vs secondary source',
        definition:
          'A primary source is firsthand evidence from the time; a secondary source analyzes or interprets it later.',
      },
    ],
  },
  {
    id: 'human-biology',
    name: 'Human Biology',
    description: 'How the human body is built and works.',
    tag: 'biology',
    cards: [
      {
        term: 'Cell',
        definition:
          'The basic structural and functional unit of all living things; the human body has trillions of them.',
      },
      {
        term: 'DNA',
        definition:
          'The molecule carrying genetic instructions, structured as a double helix of paired bases.',
      },
      {
        term: 'The circulatory system',
        definition:
          'The heart and blood vessels that transport oxygen, nutrients, and waste throughout the body.',
      },
      {
        term: 'The nervous system',
        definition:
          'The brain, spinal cord, and nerves that sense the environment and coordinate the body’s responses.',
      },
      {
        term: 'Homeostasis',
        definition:
          'The body’s maintenance of a stable internal state — temperature, pH, blood sugar — despite outside change.',
      },
      {
        term: 'Photosynthesis vs respiration',
        definition:
          'Plants make glucose from sunlight (photosynthesis); cells release its energy using oxygen (respiration).',
      },
      {
        term: 'The immune system',
        definition:
          'The network of cells and organs that defends the body against bacteria, viruses, and other threats.',
      },
      {
        term: 'Neuron',
        definition:
          'A nerve cell that transmits electrical and chemical signals, the building block of the nervous system.',
      },
      {
        term: 'Genes and inheritance',
        definition:
          'Segments of DNA passed from parents to offspring that determine inherited traits.',
      },
      {
        term: 'The respiratory system',
        definition:
          'The lungs and airways that bring in oxygen and expel carbon dioxide from the blood.',
      },
    ],
  },
  {
    id: 'literary-devices',
    name: 'Literary Devices',
    description: 'Tools writers use — essential for English class.',
    tag: 'literature',
    cards: [
      {
        term: 'Metaphor',
        definition:
          'A direct comparison saying one thing is another, without "like" or "as" (e.g. "time is a thief").',
      },
      {
        term: 'Simile',
        definition: 'A comparison using "like" or "as" (e.g. "brave as a lion").',
      },
      {
        term: 'Personification',
        definition: 'Giving human qualities to non-human things (e.g. "the wind whispered").',
      },
      {
        term: 'Alliteration',
        definition:
          'The repetition of the same initial consonant sound in nearby words (e.g. "wild and windy").',
      },
      {
        term: 'Hyperbole',
        definition:
          'Deliberate exaggeration for emphasis, not meant literally (e.g. "I’ve told you a million times").',
      },
      {
        term: 'Irony',
        definition:
          'A contrast between expectation and reality — what is said or happens differs from what is meant or expected.',
      },
      {
        term: 'Foreshadowing',
        definition: 'Hints or clues an author plants about what will happen later in a story.',
      },
      {
        term: 'Symbolism',
        definition:
          'Using an object, color, or figure to represent a larger idea (e.g. a dove for peace).',
      },
      {
        term: 'Imagery',
        definition:
          'Descriptive language that appeals to the senses to create vivid mental pictures.',
      },
      {
        term: 'Theme',
        definition:
          'The central idea or underlying message a work explores (e.g. love, justice, loss).',
      },
    ],
  },
  {
    id: 'computer-science',
    name: 'Computer Science Basics',
    description: 'Core ideas behind how software and computers work.',
    tag: 'computer-science',
    cards: [
      {
        term: 'Algorithm',
        definition:
          'A step-by-step set of instructions for solving a problem or completing a task.',
      },
      {
        term: 'Data structure',
        definition:
          'A way of organizing data so it can be accessed and modified efficiently, e.g. arrays, lists, and trees.',
      },
      {
        term: 'Binary',
        definition:
          'The base-2 number system of 0s and 1s that computers use to represent all data at the lowest level.',
      },
      {
        term: 'Big-O notation',
        definition:
          'A way to describe how an algorithm’s running time or memory grows as the input size increases.',
        details: 'O(n) grows linearly; O(n²) grows much faster.',
      },
      {
        term: 'Variable',
        definition: 'A named container that stores a value a program can read and change.',
      },
      {
        term: 'Function',
        definition:
          'A reusable block of code that performs a task, optionally taking inputs and returning a result.',
      },
      {
        term: 'Boolean logic',
        definition:
          'Logic based on true/false values combined with AND, OR, and NOT — the foundation of decisions in code.',
      },
      {
        term: 'Recursion',
        definition:
          'A technique where a function calls itself to solve smaller instances of the same problem.',
      },
      {
        term: 'Compiler vs interpreter',
        definition:
          'A compiler translates whole programs to machine code ahead of time; an interpreter runs code line by line.',
      },
      {
        term: 'Bug vs debugging',
        definition:
          'A bug is an error in a program; debugging is the process of finding and fixing it.',
      },
    ],
  },
  {
    id: 'machine-learning',
    name: 'AI & Machine Learning',
    description: 'Foundational ideas behind AI models.',
    tag: 'machine-learning',
    cards: [
      {
        term: 'Machine learning',
        definition:
          'A field where computers learn patterns from data to make predictions or decisions, rather than being explicitly programmed.',
      },
      {
        term: 'Supervised vs unsupervised learning',
        definition:
          'Supervised learning trains on labeled examples; unsupervised learning finds structure in unlabeled data.',
      },
      {
        term: 'Training vs test data',
        definition:
          'The training set fits the model; the held-out test set estimates how well it generalizes to unseen data.',
      },
      {
        term: 'Overfitting vs underfitting',
        definition:
          'Overfitting memorizes noise and fails on new data; underfitting is too simple to capture the real pattern.',
      },
      {
        term: 'Neural network',
        definition:
          'A model of layered interconnected nodes that learns weighted transformations of its inputs.',
      },
      {
        term: 'Gradient descent',
        definition:
          'An optimization method that iteratively adjusts parameters in the direction that most reduces error.',
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
        term: 'Large language model (LLM)',
        definition:
          'An AI model trained on vast text to predict the next word, enabling it to generate and understand language.',
      },
      {
        term: 'Bias in AI',
        definition:
          'When a model produces systematically unfair results because its training data or design reflected human or sampling bias.',
      },
    ],
  },
  {
    id: 'grammar-writing',
    name: 'Grammar & Writing',
    description: 'Building blocks of clear, correct writing.',
    tag: 'writing',
    cards: [
      {
        term: 'Noun, verb, adjective, adverb',
        definition:
          'A noun names a thing, a verb shows action, an adjective describes a noun, and an adverb describes a verb or adjective.',
      },
      {
        term: 'Subject and predicate',
        definition:
          'The subject is who or what the sentence is about; the predicate says what the subject does or is.',
      },
      {
        term: 'Their / there / they’re',
        definition:
          '"Their" shows possession, "there" refers to a place, and "they’re" is short for "they are".',
      },
      {
        term: 'Your vs you’re',
        definition: '"Your" shows possession; "you’re" is a contraction of "you are".',
      },
      {
        term: 'Its vs it’s',
        definition: '"Its" is possessive; "it’s" means "it is" or "it has".',
      },
      {
        term: 'Active vs passive voice',
        definition:
          'Active: the subject does the action ("the dog chased the ball"). Passive: it receives it ("the ball was chased").',
      },
      {
        term: 'Comma splice',
        definition:
          'The error of joining two complete sentences with only a comma; fix it with a period, semicolon, or conjunction.',
      },
      {
        term: 'Apostrophe',
        definition:
          'A mark used for contractions ("don’t") and possession ("Sam’s"), but not for ordinary plurals.',
      },
      {
        term: 'Synonym vs antonym',
        definition: 'A synonym means the same as another word; an antonym means the opposite.',
      },
      {
        term: 'Topic sentence',
        definition:
          'The sentence, usually first, that states the main idea a paragraph will develop.',
      },
    ],
  },
];
