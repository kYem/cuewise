/**
 * Typed storage helpers for specific data types
 */

import {
  type CalendarState,
  type CalendarStateEnvelope,
  type ConceptCard,
  calendarEventSchema,
  calendarStateEnvelopeSchema,
  conceptCardSchema,
  DAY_IN_MS,
  type DailyBackground,
  DEFAULT_SETTINGS,
  DEVICE_LOCAL_SETTINGS_KEYS,
  dailyBackgroundSchema,
  type FocusImageCategory,
  type Goal,
  getStorage,
  getTodayDateString,
  goalSchema,
  logger,
  type PlaylistProgress,
  type PomodoroSession,
  type PostureDailyStat,
  playlistProgressSchema,
  pomodoroSessionSchema,
  postureDailyStatSchema,
  type QuickLink,
  type Quote,
  type QuoteCollection,
  quickLinkSchema,
  quoteCollectionSchema,
  quoteSchema,
  type Reminder,
  reminderSchema,
  type Settings,
  STORAGE_KEYS,
  settingsSchema,
  storageFailure,
  type WeatherState,
  type YoutubePlaylist,
  youtubePlaylistSchema,
} from '@cuewise/shared';
import { type ZodMiniType, z } from 'zod/mini';
import {
  getFromStorage,
  getManyFromStorage,
  getValidatedFromStorage,
  getValidatedListFromStorage,
  removeFromStorage,
  removeManyFromStorage,
  type StorageArea,
  type StorageResult,
  setInStorage,
  setManyInStorage,
  setValidatedListInStorage,
} from './chrome-storage';

/**
 * Get the storage area based on user settings
 * Settings are always stored in local storage to avoid circular dependency
 *
 * Awaits the migration first: until it runs, syncEnabled is absent and every collection here
 * would resolve to 'local', reading a sync user's data as empty and then writing that back.
 */
async function getStorageArea(): Promise<'local' | 'sync'> {
  await ensureSettingsMigrated();
  // Single key, not the whole settings blob: this runs on nearly every storage helper call.
  const stored = await getValidatedFromStorage<boolean>(
    settingsStorageKey('syncEnabled'),
    settingsSchema.def.shape.syncEnabled,
    'local'
  );
  const syncEnabled =
    stored ?? unmigratedSettingsValue('syncEnabled') ?? DEFAULT_SETTINGS.syncEnabled;
  if (syncEnabled) {
    return 'sync';
  }
  return 'local';
}

// Quotes - Hybrid Storage Strategy
// Seed quotes: Always stored in local storage (same on all devices)
// Custom quotes: Stored in sync/local based on user preference (user-created data)

/**
 * Check if a quote is a custom quote (user-created or modified seed quote)
 */
function isCustomQuote(quote: Quote): boolean {
  // Custom quotes have isCustom flag OR have been favorited/hidden (modified state)
  return quote.isCustom || quote.isFavorite || quote.isHidden;
}

/**
 * Migrate legacy quotes storage to hybrid storage
 * Called automatically when old 'quotes' key is detected
 */
async function migrateLegacyQuotes(): Promise<void> {
  try {
    // Raw, and this one matters more than the other movers: the legacy key is REMOVED at
    // the end, so a quote dropped from the copy is not quarantined anywhere — it is gone.
    // Every other validated read leaves the bytes on disk to be salvaged later.
    const localQuotes = await getFromStorage<Quote[]>(STORAGE_KEYS.QUOTES, 'local');
    const syncQuotes = await getFromStorage<Quote[]>(STORAGE_KEYS.QUOTES, 'sync');
    const legacyQuotes = localQuotes || syncQuotes;

    if (!legacyQuotes || legacyQuotes.length === 0) {
      return; // No migration needed
    }

    logger.info('Migrating legacy quotes to hybrid storage...');

    // Split into seed and custom quotes
    const seedQuotes = legacyQuotes.filter((q) => !isCustomQuote(q));
    const customQuotes = legacyQuotes.filter((q) => isCustomQuote(q));

    // Store seed quotes in local storage
    if (seedQuotes.length > 0) {
      await setInStorage(STORAGE_KEYS.SEED_QUOTES, seedQuotes, 'local');
    }

    // Store custom quotes in appropriate storage area
    if (customQuotes.length > 0) {
      const area = await getStorageArea();
      await setInStorage(STORAGE_KEYS.CUSTOM_QUOTES, customQuotes, area);
    }

    // Clean up legacy storage from both areas
    await removeFromStorage(STORAGE_KEYS.QUOTES, 'local');
    await removeFromStorage(STORAGE_KEYS.QUOTES, 'sync');

    logger.info(
      `Migration complete: ${seedQuotes.length} seed quotes, ${customQuotes.length} custom quotes`
    );
  } catch (error) {
    logger.error('Error migrating legacy quotes', error);
  }
}

export async function getQuotes(): Promise<Quote[]> {
  try {
    // Raw: this only decides whether to migrate, and the migration itself must see
    // everything that is there.
    const legacyQuotes = await getFromStorage<Quote[]>(STORAGE_KEYS.QUOTES, 'local');
    if (legacyQuotes && legacyQuotes.length > 0) {
      await migrateLegacyQuotes();
    }

    // Load seed quotes from local storage (always)
    const seedQuotes =
      (await getValidatedListFromStorage<Quote>(STORAGE_KEYS.SEED_QUOTES, quoteSchema, 'local')) ??
      [];

    // Load custom quotes from appropriate storage area
    const area = await getStorageArea();
    const customQuotes =
      (await getValidatedListFromStorage<Quote>(STORAGE_KEYS.CUSTOM_QUOTES, quoteSchema, area)) ??
      [];

    // Merge seed and custom quotes
    return [...seedQuotes, ...customQuotes];
  } catch (error) {
    logger.error('Error getting quotes', error);
    return [];
  }
}

export async function setQuotes(quotes: Quote[]): Promise<StorageResult> {
  try {
    // Split into seed and custom quotes
    const seedQuotes = quotes.filter((q) => !isCustomQuote(q));
    const customQuotes = quotes.filter((q) => isCustomQuote(q));

    // Store seed quotes in local storage
    const seedResult = await setValidatedListInStorage(
      STORAGE_KEYS.SEED_QUOTES,
      seedQuotes,
      quoteSchema,
      'local'
    );
    if (!seedResult.success) {
      return seedResult;
    }

    // Store custom quotes in appropriate storage area
    const area = await getStorageArea();
    const customResult = await setValidatedListInStorage(
      STORAGE_KEYS.CUSTOM_QUOTES,
      customQuotes,
      quoteSchema,
      area
    );

    return customResult;
  } catch (error) {
    logger.error('Error setting quotes', error);
    return storageFailure('Error setting quotes');
  }
}

export async function getCurrentQuote(): Promise<Quote | null> {
  const area = await getStorageArea();
  return getValidatedFromStorage<Quote>(STORAGE_KEYS.CURRENT_QUOTE, quoteSchema, area);
}

export async function setCurrentQuote(quote: Quote): Promise<StorageResult> {
  const area = await getStorageArea();
  return setInStorage(STORAGE_KEYS.CURRENT_QUOTE, quote, area);
}

// Goals
export async function getGoals(): Promise<Goal[]> {
  const area = await getStorageArea();
  const goals = await getValidatedListFromStorage<Goal>(STORAGE_KEYS.GOALS, goalSchema, area);
  return goals ?? [];
}

export async function setGoals(goals: Goal[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(STORAGE_KEYS.GOALS, goals, goalSchema, area);
}

// Reminders
export async function getReminders(): Promise<Reminder[]> {
  const area = await getStorageArea();
  const reminders = await getValidatedListFromStorage<Reminder>(
    STORAGE_KEYS.REMINDERS,
    reminderSchema,
    area
  );
  return reminders ?? [];
}

export async function setReminders(reminders: Reminder[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(STORAGE_KEYS.REMINDERS, reminders, reminderSchema, area);
}

// Quote Collections
export async function getCollections(): Promise<QuoteCollection[]> {
  const area = await getStorageArea();
  const collections = await getValidatedListFromStorage<QuoteCollection>(
    STORAGE_KEYS.COLLECTIONS,
    quoteCollectionSchema,
    area
  );
  return collections ?? [];
}

export async function setCollections(collections: QuoteCollection[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(
    STORAGE_KEYS.COLLECTIONS,
    collections,
    quoteCollectionSchema,
    area
  );
}

// Quick Links (pinned shortcut tiles on the new tab)
export async function getQuickLinks(): Promise<QuickLink[]> {
  const area = await getStorageArea();
  const links = await getValidatedListFromStorage<QuickLink>(
    STORAGE_KEYS.QUICK_LINKS,
    quickLinkSchema,
    area
  );
  return links ?? [];
}

export async function setQuickLinks(links: QuickLink[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(STORAGE_KEYS.QUICK_LINKS, links, quickLinkSchema, area);
}

// Concept Cards (spaced-repetition learning cards)
export async function getConceptCards(): Promise<ConceptCard[]> {
  const area = await getStorageArea();
  const cards = await getValidatedListFromStorage<ConceptCard>(
    STORAGE_KEYS.CONCEPT_CARDS,
    conceptCardSchema,
    area
  );
  return cards ?? [];
}

export async function setConceptCards(cards: ConceptCard[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(STORAGE_KEYS.CONCEPT_CARDS, cards, conceptCardSchema, area);
}

// Posture daily rollups (macOS tracking; always local — device-specific data)
export async function getPostureStats(): Promise<PostureDailyStat[]> {
  const stats = await getValidatedListFromStorage<PostureDailyStat>(
    STORAGE_KEYS.POSTURE_STATS,
    postureDailyStatSchema,
    'local'
  );
  return stats ?? [];
}

export async function setPostureStats(stats: PostureDailyStat[]): Promise<StorageResult> {
  return setValidatedListInStorage(
    STORAGE_KEYS.POSTURE_STATS,
    stats,
    postureDailyStatSchema,
    'local'
  );
}

// Google Calendar (connection + cached events; always local)
export async function getCalendarState(): Promise<CalendarState | null> {
  const stored = await getValidatedFromStorage<CalendarStateEnvelope>(
    STORAGE_KEYS.CALENDAR,
    calendarStateEnvelopeSchema,
    'local'
  );
  if (stored === null) {
    return null;
  }
  // Events are filtered per item: one stale cached row must not cost `connected`, which the
  // store cannot recover without sending the user back through Google's consent screen.
  const events = stored.events.filter(
    (event) => calendarEventSchema.safeParse(event).success
  ) as CalendarState['events'];
  return { ...stored, events };
}

export async function setCalendarState(state: CalendarState): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.CALENDAR, state, 'local');
}

// Always local, which is what makes the location per-device: a travelling laptop shows
// where it actually is.
export async function getWeatherState(): Promise<WeatherState | null> {
  // Raw: `weather-store.initialize` salvages location, snapshot and timestamp independently,
  // and validating the wrapper here would take the saved city with a bad reading.
  return getFromStorage<WeatherState>(STORAGE_KEYS.WEATHER, 'local');
}

export async function setWeatherState(state: WeatherState): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.WEATHER, state, 'local');
}

// Pomodoro Sessions
export async function getPomodoroSessions(): Promise<PomodoroSession[]> {
  const area = await getStorageArea();
  const sessions = await getValidatedListFromStorage<PomodoroSession>(
    STORAGE_KEYS.POMODORO_SESSIONS,
    pomodoroSessionSchema,
    area
  );
  return sessions ?? [];
}

export async function setPomodoroSessions(sessions: PomodoroSession[]): Promise<StorageResult> {
  const area = await getStorageArea();
  return setValidatedListInStorage(
    STORAGE_KEYS.POMODORO_SESSIONS,
    sessions,
    pomodoroSessionSchema,
    area
  );
}

// Custom YouTube Playlists (for Pomodoro music)
// Note: Custom playlists are stored in local storage (not synced)
export async function getCustomYoutubePlaylists(): Promise<YoutubePlaylist[]> {
  const playlists = await getValidatedListFromStorage<YoutubePlaylist>(
    STORAGE_KEYS.CUSTOM_YOUTUBE_PLAYLISTS,
    youtubePlaylistSchema,
    'local'
  );
  return playlists ?? [];
}

export async function setCustomYoutubePlaylists(
  playlists: YoutubePlaylist[]
): Promise<StorageResult> {
  return setValidatedListInStorage(
    STORAGE_KEYS.CUSTOM_YOUTUBE_PLAYLISTS,
    playlists,
    youtubePlaylistSchema,
    'local'
  );
}

// Settings — one storage key per setting, always in the local area.
// Sparse on purpose: an absent key means "follow the current default", so shipping a changed
// default reaches everyone who never chose otherwise. Any explicit write stores the key even
// when the value equals the default, so a deliberate reset still syncs.
export const SETTINGS_KEY_PREFIX = 'settings.';

export function settingsStorageKey(key: string): string {
  return `${SETTINGS_KEY_PREFIX}${key}`;
}

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

const SETTINGS_STORAGE_KEYS = SETTINGS_KEYS.map(settingsStorageKey);

const SETTINGS_FIELD_SCHEMAS = settingsSchema.def.shape as Record<string, ZodMiniType | undefined>;

/** Own properties only — a stored key named `constructor` or `toString` otherwise hits Object.prototype. */
function settingsFieldSchema(key: string): ZodMiniType | undefined {
  if (!Object.hasOwn(SETTINGS_FIELD_SCHEMAS, key)) {
    return undefined;
  }
  return SETTINGS_FIELD_SCHEMAS[key];
}

/** A key with no schema is a newer build's, so there is nothing to judge it against. */
function settingsValueIsValid(key: string, value: unknown): boolean {
  const fieldSchema = settingsFieldSchema(key);
  if (fieldSchema === undefined) {
    return true;
  }
  return fieldSchema.safeParse(value).success;
}

/**
 * Field-wise, never all-or-nothing: one unreadable value must not reset every preference —
 * including `syncEnabled`, which picks the storage area, making synced data read as empty.
 */
function keepReadableSettingsFields(values: Record<string, unknown>): Partial<Settings> {
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const key of SETTINGS_KEYS) {
    const value = values[key];
    if (value === undefined) {
      continue;
    }
    if (settingsValueIsValid(key, value)) {
      kept[key] = value;
    } else {
      dropped.push(key);
    }
  }
  if (dropped.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.error('Ignored unreadable settings fields, using their defaults', { fields: dropped });
  }
  return kept as Partial<Settings>;
}

// Nothing to seed for a key this build cannot name: it sits in its own entry, which no patch
// rewrites.
async function readSettingsEntries(): Promise<Record<string, unknown>> {
  await ensureSettingsMigrated();
  const stored = await getManyFromStorage(SETTINGS_STORAGE_KEYS, 'local');
  const byKey: Record<string, unknown> = {};
  for (const key of SETTINGS_KEYS) {
    const value = stored[settingsStorageKey(key)];
    byKey[key] = value === undefined ? unmigratedSettings?.[key] : value;
  }
  return byKey;
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...keepReadableSettingsFields(await readSettingsEntries()) };
}

/**
 * Raw bytes of the legacy blob; null when never stored or unreadable (the port conflates them).
 * Exported only for the migration tests below — production code has no reason to read the
 * legacy shape once `migrateLegacySettings` has run.
 */
export async function readLegacySettingsBlob(): Promise<Record<string, unknown> | null> {
  const raw = await getFromStorage<unknown>(STORAGE_KEYS.SETTINGS, 'local');
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  return raw as Record<string, unknown>;
}

// Migration first: it fills gaps from the legacy blob, so a write that lands before it would be
// read back as a gap and overwritten by the older value.
async function writeSettingsEntries(patch: Partial<Settings>): Promise<StorageResult> {
  await ensureSettingsMigrated();
  // `undefined` is not storable — localStorage would keep the string "undefined" and throw on
  // every later read. Omitting a key is how a caller says "leave it alone".
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  return setManyInStorage(
    Object.fromEntries(entries.map(([key, value]) => [settingsStorageKey(key), value])),
    'local'
  );
}

/**
 * The unjudged write, for sync applying a value from a peer on another version: our schema is
 * not its schema, and the value costs its own key alone, which every read defaults meanwhile.
 * Device-local keys are dropped here (not just by `collections.ts`'s caller) so any future
 * caller of this path structurally cannot write `syncEnabled` and break area routing.
 */
export async function setSettingsPatchRaw(patch: Partial<Settings>): Promise<StorageResult> {
  const shared = Object.fromEntries(
    Object.entries(patch).filter(([key]) => !DEVICE_LOCAL_SETTINGS_KEYS.includes(key))
  );
  return writeSettingsEntries(shared);
}

/**
 * A value that fails its schema fails the whole patch: every read would hand back the default
 * instead, so a change the user asked for would look saved and never take effect.
 *
 * Writes device-local keys too — this is the path the user's own UI saves through, and the
 * raw path's filter belongs to sync alone.
 */
export async function setSettingsPatch(patch: Partial<Settings>): Promise<StorageResult> {
  const rejected = Object.keys(patch).filter(
    (key) => !settingsValueIsValid(key, patch[key as keyof Settings])
  );
  if (rejected.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.error('Refused a settings write that does not match its schema', { fields: rejected });
    return storageFailure(`Settings values do not match their schema: ${rejected.join(', ')}`);
  }
  return writeSettingsEntries(patch);
}

export async function clearSettings(): Promise<boolean> {
  // Migrate then delete the blob: the migration reads an absent per-key entry as a gap to fill,
  // so a surviving blob would restore every cleared value on the next read.
  await ensureSettingsMigrated();
  unmigratedSettings = null;
  return removeManyFromStorage([...SETTINGS_STORAGE_KEYS, STORAGE_KEYS.SETTINGS], 'local');
}

/**
 * One-time move from the legacy settings blob to per-key entries. Idempotent and safe to run in
 * more than one realm: it fills only gaps, so a value a sync pull already wrote is never clobbered,
 * and it writes nothing at all through the store, so no key is ever marked dirty for sync.
 */
export async function migrateLegacySettings(): Promise<void> {
  // Raw: an unreadable blob reads as null and skips the delete below, rather than being
  // discarded for holding something this build could not parse.
  const blob = await readLegacySettingsBlob();
  if (blob === null) {
    return;
  }

  const existing = await getManyFromStorage(Object.keys(blob).map(settingsStorageKey), 'local');
  const patch: Record<string, unknown> = {};
  const discarded: string[] = [];
  for (const [key, value] of Object.entries(blob)) {
    const storageKey = settingsStorageKey(key);
    if (existing[storageKey] !== undefined) {
      continue;
    }
    const fieldSchema = settingsFieldSchema(key);
    if (fieldSchema === undefined) {
      // A key this build does not know, carried across because the blob is deleted below.
      patch[storageKey] = value;
      continue;
    }
    if (!fieldSchema.safeParse(value).success) {
      discarded.push(key);
      continue;
    }
    // Structural compare — two settings hold arrays, which never compare equal by identity.
    if (JSON.stringify(value) === JSON.stringify(DEFAULT_SETTINGS[key as keyof Settings])) {
      continue;
    }
    patch[storageKey] = value;
  }

  if (Object.keys(patch).length > 0) {
    const result = await setManyInStorage(patch, 'local');
    if (!result.success) {
      // Held in memory as well as on disk: a reader that saw no per-key entry would otherwise
      // take every setting for a gap, and `syncEnabled` decides which area the data lives in.
      unmigratedSettings = blob;
      logger.error('Settings migration write failed; keeping the legacy blob', result.error);
      return;
    }
  }
  unmigratedSettings = null;

  if (discarded.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked. This is
    // the one settings path that destroys rather than shadows, so it has to leave a trace.
    logger.error('Dropping legacy settings values that do not match their schema', {
      fields: discarded,
    });
  }

  const removed = await removeFromStorage(STORAGE_KEYS.SETTINGS, 'local');
  if (!removed) {
    logger.error('Migrated the legacy settings blob but could not delete it');
  }
}

// The blob of a migration whose write failed: still the truth for its keys until one succeeds.
let unmigratedSettings: Record<string, unknown> | null = null;

function unmigratedSettingsValue<K extends keyof Settings>(key: K): Settings[K] | undefined {
  const value = unmigratedSettings?.[key];
  if (value === undefined || !settingsValueIsValid(key, value)) {
    return undefined;
  }
  return value as Settings[K];
}

let settingsMigration: Promise<void> | null = null;

/**
 * Runs the legacy-blob migration once per realm; every settings read awaits it, so no
 * caller has to order it. migrateLegacySettings must never call this — it reads and writes with
 * an explicit 'local' area rather than through getStorageArea, which keeps that from recursing.
 */
export function ensureSettingsMigrated(): Promise<void> {
  if (settingsMigration === null) {
    // A rejection is not memoized: getStorageArea awaits this on nearly every storage call, so
    // caching one would fail every read and write in the realm for the rest of the session.
    settingsMigration = migrateLegacySettings().catch((error: unknown) => {
      settingsMigration = null;
      throw error;
    });
  }
  return settingsMigration;
}

/** Drops the memo so the next read migrates again. For test isolation. */
export function resetSettingsMigration(): void {
  settingsMigration = null;
  unmigratedSettings = null;
}

/**
 * Raw list reads for the sync engine. An item hidden from `readAll` is deleted by the next
 * `writeOne`, and its absence is how the cycle infers a tombstone for every other device.
 *
 * Items are unjudged, but the list itself is: every caller iterates it, so a stored non-array
 * would throw out of `readAll` and wedge the cycle for every collection at once.
 */
async function getListRaw<T>(key: string, area: StorageArea): Promise<T[]> {
  const raw = await getFromStorage<unknown>(key, area);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw as T[];
}

export async function getGoalsRaw(): Promise<Goal[]> {
  return getListRaw<Goal>(STORAGE_KEYS.GOALS, await getStorageArea());
}

export async function getRemindersRaw(): Promise<Reminder[]> {
  return getListRaw<Reminder>(STORAGE_KEYS.REMINDERS, await getStorageArea());
}

export async function getCollectionsRaw(): Promise<QuoteCollection[]> {
  return getListRaw<QuoteCollection>(STORAGE_KEYS.COLLECTIONS, await getStorageArea());
}

/** Defaults fill only what was never written; nothing is defaulted for being unreadable. */
export async function getSettingsForSync(): Promise<Settings> {
  const entries = await readSettingsEntries();
  const present = Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined)
  );
  return { ...DEFAULT_SETTINGS, ...present } as Settings;
}

export async function getPomodoroSessionsRaw(): Promise<PomodoroSession[]> {
  return getListRaw<PomodoroSession>(STORAGE_KEYS.POMODORO_SESSIONS, await getStorageArea());
}

/** Counterpart to the raw reads: this caller saw everything, so its omissions must land. */
export async function setGoalsRaw(goals: Goal[]): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.GOALS, goals, await getStorageArea());
}

export async function setRemindersRaw(reminders: Reminder[]): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.REMINDERS, reminders, await getStorageArea());
}

export async function setCollectionsRaw(collections: QuoteCollection[]): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.COLLECTIONS, collections, await getStorageArea());
}

export async function setPomodoroSessionsRaw(sessions: PomodoroSession[]): Promise<StorageResult> {
  return setInStorage(STORAGE_KEYS.POMODORO_SESSIONS, sessions, await getStorageArea());
}

/** Mirrors `setQuotes`'s seed/custom split, without preserving anything. */
export async function setQuotesRaw(quotes: Quote[]): Promise<StorageResult> {
  const seed = quotes.filter((q) => !isCustomQuote(q));
  const custom = quotes.filter((q) => isCustomQuote(q));
  const seedResult = await setInStorage(STORAGE_KEYS.SEED_QUOTES, seed, 'local');
  if (!seedResult.success) {
    return seedResult;
  }
  return setInStorage(STORAGE_KEYS.CUSTOM_QUOTES, custom, await getStorageArea());
}

/** Seed plus custom, mirroring `getQuotes`, but without dropping anything. */
export async function getQuotesRaw(): Promise<Quote[]> {
  const [seed, area] = await Promise.all([
    getListRaw<Quote>(STORAGE_KEYS.SEED_QUOTES, 'local'),
    getStorageArea(),
  ]);
  return [...seed, ...(await getListRaw<Quote>(STORAGE_KEYS.CUSTOM_QUOTES, area))];
}

// Storage usage tracking
export interface StorageUsageInfo {
  bytesInUse: number;
  quota: number;
  percentageUsed: number;
  isWarning: boolean; // > 75%
  isCritical: boolean; // > 90%
}

/**
 * Storage usage (bytes + quota) from the active KeyValueStore backend for the
 * user's area, plus warning/critical thresholds. In the extension that's
 * chrome.storage (100KB sync / 10MB local); in dev it's the localStorage estimate.
 */
export async function getStorageUsage(): Promise<StorageUsageInfo> {
  try {
    const area = await getStorageArea();
    const { bytesInUse, quota } = await getStorage().getUsage(area);
    let percentageUsed = 0;
    if (quota > 0) {
      percentageUsed = (bytesInUse / quota) * 100;
    }

    return {
      bytesInUse,
      quota,
      percentageUsed,
      isWarning: percentageUsed > 75,
      isCritical: percentageUsed > 90,
    };
  } catch (error) {
    logger.error('Error getting storage usage', error);
    // Return safe defaults on error (assume local storage)
    return {
      bytesInUse: 0,
      quota: 10485760,
      percentageUsed: 0,
      isWarning: false,
      isCritical: false,
    };
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Migrate data between storage areas (local <-> sync)
 * Used when user toggles the syncEnabled setting
 *
 * Note: Seed quotes always stay in local storage.
 * Only custom quotes and user data are migrated.
 */
export async function migrateStorageData(
  fromArea: 'local' | 'sync',
  toArea: 'local' | 'sync'
): Promise<StorageResult> {
  try {
    // Raw: a validated read turns an unreadable blob into `[]`, which the unconditional
    // writes below would then copy over live data in the destination area.
    const customQuotes =
      (await getFromStorage<Quote[]>(STORAGE_KEYS.CUSTOM_QUOTES, fromArea)) ?? [];
    const currentQuote = await getFromStorage<Quote>(STORAGE_KEYS.CURRENT_QUOTE, fromArea);
    const goals = (await getFromStorage<Goal[]>(STORAGE_KEYS.GOALS, fromArea)) ?? [];
    const reminders = (await getFromStorage<Reminder[]>(STORAGE_KEYS.REMINDERS, fromArea)) ?? [];
    const sessions =
      (await getFromStorage<PomodoroSession[]>(STORAGE_KEYS.POMODORO_SESSIONS, fromArea)) ?? [];
    const collections =
      (await getFromStorage<QuoteCollection[]>(STORAGE_KEYS.COLLECTIONS, fromArea)) ?? [];
    const quickLinks =
      (await getFromStorage<QuickLink[]>(STORAGE_KEYS.QUICK_LINKS, fromArea)) ?? [];
    const conceptCards =
      (await getFromStorage<ConceptCard[]>(STORAGE_KEYS.CONCEPT_CARDS, fromArea)) ?? [];

    // Copy data to destination storage area
    // Note: Seed quotes are not migrated (always in local storage)
    const results: StorageResult[] = [];

    results.push(await setInStorage(STORAGE_KEYS.CUSTOM_QUOTES, customQuotes, toArea));
    if (currentQuote) {
      results.push(await setInStorage(STORAGE_KEYS.CURRENT_QUOTE, currentQuote, toArea));
    }
    results.push(await setInStorage(STORAGE_KEYS.GOALS, goals, toArea));
    results.push(await setInStorage(STORAGE_KEYS.REMINDERS, reminders, toArea));
    results.push(await setInStorage(STORAGE_KEYS.POMODORO_SESSIONS, sessions, toArea));
    results.push(await setInStorage(STORAGE_KEYS.COLLECTIONS, collections, toArea));
    results.push(await setInStorage(STORAGE_KEYS.QUICK_LINKS, quickLinks, toArea));
    results.push(await setInStorage(STORAGE_KEYS.CONCEPT_CARDS, conceptCards, toArea));

    // Check if any operation failed
    const failedResult = results.find((r) => !r.success);
    if (failedResult) {
      return failedResult;
    }

    logger.info(`Successfully migrated data from ${fromArea} to ${toArea}`);
    logger.info(
      `Migrated ${customQuotes.length} custom quotes (seed quotes remain in local storage)`
    );
    return { success: true };
  } catch (error) {
    logger.error(`Error migrating data from ${fromArea} to ${toArea}`, error);
    return storageFailure(`Error migrating data from ${fromArea} to ${toArea}`);
  }
}

// YouTube Progress (timestamp memory)
// Note: Progress is stored in local storage only (not synced)
const PROGRESS_MAX_AGE_MS = 30 * DAY_IN_MS;

/**
 * Get all YouTube playlist progress data
 */
export async function getYoutubeProgress(): Promise<PlaylistProgress[]> {
  const progress = await getValidatedListFromStorage<PlaylistProgress>(
    STORAGE_KEYS.YOUTUBE_PROGRESS,
    playlistProgressSchema,
    'local'
  );
  return progress ?? [];
}

/**
 * Update video progress (timestamp) for a specific video in a playlist
 * Also cleans up entries older than 30 days
 */
export async function updateVideoProgress(
  playlistId: string,
  videoId: string,
  timestamp: number
): Promise<StorageResult> {
  try {
    const allProgress = await getYoutubeProgress();
    const now = new Date().toISOString();
    const cutoffTime = Date.now() - PROGRESS_MAX_AGE_MS;

    // Find or create playlist progress
    let playlistProgress = allProgress.find((p) => p.playlistId === playlistId);

    if (!playlistProgress) {
      playlistProgress = {
        playlistId,
        currentVideoId: videoId,
        videoProgress: [],
      };
      allProgress.push(playlistProgress);
    }

    // Update current video
    playlistProgress.currentVideoId = videoId;

    // Update or add video progress
    const existingVideoProgress = playlistProgress.videoProgress.find((v) => v.videoId === videoId);

    if (existingVideoProgress) {
      existingVideoProgress.timestamp = timestamp;
      existingVideoProgress.updatedAt = now;
    } else {
      playlistProgress.videoProgress.push({
        videoId,
        timestamp,
        updatedAt: now,
      });
    }

    // Clean up old entries (videos not updated in 30 days)
    playlistProgress.videoProgress = playlistProgress.videoProgress.filter((v) => {
      const updatedAt = new Date(v.updatedAt).getTime();
      return updatedAt > cutoffTime;
    });

    // Remove playlists with no video progress
    const cleanedProgress = allProgress.filter((p) => p.videoProgress.length > 0);

    return setValidatedListInStorage(
      STORAGE_KEYS.YOUTUBE_PROGRESS,
      cleanedProgress,
      playlistProgressSchema,
      'local'
    );
  } catch (error) {
    logger.error('Error updating video progress', error);
    return storageFailure('Error updating video progress');
  }
}

export interface PlaylistResumeInfo {
  videoId: string;
  timestamp: number;
}

/**
 * Get the current video ID and timestamp for a playlist (last played video)
 * Returns both the videoId and timestamp to avoid multiple storage lookups
 */
export async function getCurrentVideoForPlaylist(
  playlistId: string
): Promise<PlaylistResumeInfo | null> {
  try {
    const allProgress = await getYoutubeProgress();
    const playlistProgress = allProgress.find((p) => p.playlistId === playlistId);

    if (!playlistProgress?.currentVideoId) {
      return null;
    }

    const videoProgress = playlistProgress.videoProgress.find(
      (v) => v.videoId === playlistProgress.currentVideoId
    );

    return {
      videoId: playlistProgress.currentVideoId,
      timestamp: videoProgress?.timestamp ?? 0,
    };
  } catch (error) {
    logger.error('Error getting current video for playlist', error);
    return null;
  }
}

// Daily Background (persisted to change only once per day)
// Note: Daily background is stored in local storage only (not synced)

/**
 * Get the daily background image data
 * Returns null if no background is stored or if the stored background is from a different day
 */
export async function getDailyBackground(
  category: FocusImageCategory
): Promise<DailyBackground | null> {
  try {
    const background = await getValidatedFromStorage<DailyBackground>(
      STORAGE_KEYS.DAILY_BACKGROUND,
      dailyBackgroundSchema,
      'local'
    );

    if (!background) {
      return null;
    }

    // Check if the background is from today and matches the category
    const today = getTodayDateString();
    if (background.date === today && background.category === category) {
      return background;
    }

    // Background is stale (different day or category)
    return null;
  } catch (error) {
    logger.error('Error getting daily background', error);
    return null;
  }
}

/**
 * Save the daily background image data
 */
export async function setDailyBackground(
  url: string,
  category: FocusImageCategory
): Promise<StorageResult> {
  try {
    const background: DailyBackground = {
      url,
      category,
      date: getTodayDateString(),
    };

    return setInStorage(STORAGE_KEYS.DAILY_BACKGROUND, background, 'local');
  } catch (error) {
    logger.error('Error setting daily background', error);
    return storageFailure('Error setting daily background');
  }
}

/** The user's own background as a data URL; null when unset or unreadable. */
export async function getCustomBackground(): Promise<string | null> {
  try {
    return await getValidatedFromStorage<string>(
      STORAGE_KEYS.CUSTOM_BACKGROUND,
      z.string(),
      'local'
    );
  } catch (error) {
    logger.error('Error getting custom background', error);
    return null;
  }
}

/** Always check `success` — a large image can exceed the quota. */
export async function setCustomBackground(dataUrl: string): Promise<StorageResult> {
  try {
    return await setInStorage(STORAGE_KEYS.CUSTOM_BACKGROUND, dataUrl, 'local');
  } catch (error) {
    logger.error('Error setting custom background', error);
    return storageFailure('Error setting custom background');
  }
}

/** Always check `success` — on failure the image is still on the device and will return. */
export async function clearCustomBackground(): Promise<StorageResult> {
  try {
    const removed = await removeFromStorage(STORAGE_KEYS.CUSTOM_BACKGROUND, 'local');
    if (!removed) {
      return storageFailure('Could not remove the custom background');
    }
    return { success: true };
  } catch (error) {
    logger.error('Error clearing custom background', error);
    return storageFailure('Error clearing custom background');
  }
}
