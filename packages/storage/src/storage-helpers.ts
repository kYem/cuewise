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
  type StoredValues,
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
  keepValidListItems,
  listStorageKeys,
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
 *
 * Throws when the read fails, rather than answering an area it cannot know — every caller
 * already surfaces that as an error state, which is recoverable where a wrong area is not.
 */
async function getStorageArea(): Promise<'local' | 'sync'> {
  await ensureSettingsMigrated();
  // One batch, not the whole settings blob: this runs on nearly every storage helper call, so
  // reading through to the blob a failed migration left behind costs no extra round trip.
  const stored = await getManyFromStorage(
    [SETTINGS_SYNC_ENABLED_KEY, STORAGE_KEYS.SETTINGS, STORAGE_KEYS.SETTINGS_MIGRATED],
    'local'
  );
  if (stored === null) {
    // Answering 'local' on a guess reads a sync user's data as empty, and the sync cycle then
    // seals every dirty entity as a deletion for every other device.
    logger.error('Could not read syncEnabled; refusing to guess the storage area');
    throw new Error('Could not determine the storage area: the settings read failed');
  }
  const perKey = stored[SETTINGS_SYNC_ENABLED_KEY];
  if (perKey !== undefined && !perKey.readable) {
    logger.error('syncEnabled is stored but unreadable; refusing to guess the storage area');
    throw new Error('Could not determine the storage area: syncEnabled is unreadable');
  }
  let syncEnabled: unknown = DEFAULT_SETTINGS.syncEnabled;
  if (perKey?.readable === true && settingsValueIsValid('syncEnabled', perKey.value)) {
    syncEnabled = perKey.value;
  } else if (!settingsMigrationCompleted(stored)) {
    // The blob back-stops the per-key value until the migration runs, so an unreadable blob is as
    // blinding as an unreadable per-key entry — reading it as "never held syncEnabled" is a guess.
    const blobEntry = stored[STORAGE_KEYS.SETTINGS];
    if (blobEntry !== undefined && !blobEntry.readable) {
      logger.error('The legacy settings blob is unreadable; refusing to guess the storage area');
      throw new Error(
        'Could not determine the storage area: the legacy settings blob is unreadable'
      );
    }
    let legacy: unknown;
    if (blobEntry?.readable === true) {
      legacy = legacySettingsField(blobEntry.value, 'syncEnabled');
    }
    if (legacy !== undefined) {
      syncEnabled = legacy;
    }
  }
  if (syncEnabled === true) {
    return 'sync';
  }
  return 'local';
}

// Quotes - Hybrid Storage Strategy
// Seed quotes: Always stored in local storage (same on all devices)
// Custom quotes: Stored in sync/local based on user preference (user-created data)

/**
 * Which quotes belong to the user rather than the seed set: user-created, or a seed quote they
 * favourited or hid. Exported because it decides which key a quote lands in, so anything handing
 * back "the user's quotes" — the export above all — must ask the same question or omit what it stored.
 */
export function isCustomQuote(quote: Quote): boolean {
  return quote.isCustom || quote.isFavorite || quote.isHidden;
}

/**
 * The legacy quotes key in one area: `null` only when it was never written. Throws when the read
 * failed or the value is unreadable — the single-key read conflates those with absence, and this
 * is the path that DELETES the key, so a wrong "nothing here" is not recoverable.
 */
async function readLegacyQuotes(area: StorageArea): Promise<Quote[] | null> {
  const stored = await getManyFromStorage([STORAGE_KEYS.QUOTES], area);
  if (stored === null) {
    logger.error('Could not read the legacy quotes key', { area });
    throw new Error(`Could not read the legacy quotes key in ${area} storage`);
  }
  const entry = stored[STORAGE_KEYS.QUOTES];
  if (entry === undefined) {
    return null;
  }
  if (!entry.readable) {
    logger.error('The legacy quotes key is stored but unreadable', { area });
    throw new Error(`The legacy quotes key in ${area} storage is unreadable`);
  }
  if (!Array.isArray(entry.value)) {
    return null;
  }
  return entry.value as Quote[];
}

/**
 * One leg of the move, merged by id rather than overwritten. Deleting the legacy key is allowed
 * to fail, so this runs again on the next read — and an overwrite would replace everything added
 * to the destination since with the stale legacy copy.
 */
async function moveLegacyQuotesInto(
  key: string,
  incoming: Quote[],
  area: StorageArea
): Promise<void> {
  if (incoming.length === 0) {
    return;
  }
  // Raw: a validated read hides rows this build cannot parse, and the merge would then drop them.
  const existing = await getListRaw<{ id?: unknown }>(key, area);
  const existingIds = new Set(existing.map((item) => item?.id));
  const missing = incoming.filter((quote) => !existingIds.has(quote.id));
  if (missing.length === 0) {
    return;
  }
  const result = await setInStorage(key, [...existing, ...missing], area);
  if (!result.success) {
    logger.error('Quote migration write failed; keeping the legacy key', result.error);
    throw new Error(`Could not migrate the legacy quotes: ${result.error.message}`);
  }
}

/**
 * Migrate legacy quotes storage to hybrid storage
 * Called automatically when old 'quotes' key is detected
 */
async function migrateLegacyQuotes(): Promise<void> {
  // Raw, and this one matters more than the other movers: the legacy key is REMOVED at
  // the end, so a quote dropped from the copy is not quarantined anywhere — it is gone.
  // Every other validated read leaves the bytes on disk to be salvaged later.
  // readLegacyQuotes throws on a failed local read, so sync can only stand in for a local key
  // that was never written — never for one this build could not see.
  const localQuotes = await readLegacyQuotes('local');
  const syncQuotes = await readLegacyQuotes('sync');
  const legacyQuotes = localQuotes ?? syncQuotes;

  if (legacyQuotes === null || legacyQuotes.length === 0) {
    return; // No migration needed
  }

  logger.info('Migrating legacy quotes to hybrid storage...');

  // Split into seed and custom quotes
  const seedQuotes = legacyQuotes.filter((q) => !isCustomQuote(q));
  const customQuotes = legacyQuotes.filter((q) => isCustomQuote(q));

  // Every write is checked before the delete below: the legacy key is the only copy, so a
  // dropped result would trade a failed write for lost quotes.
  await moveLegacyQuotesInto(STORAGE_KEYS.SEED_QUOTES, seedQuotes, 'local');
  if (customQuotes.length > 0) {
    await moveLegacyQuotesInto(STORAGE_KEYS.CUSTOM_QUOTES, customQuotes, await getStorageArea());
  }

  const removedLocal = await removeFromStorage(STORAGE_KEYS.QUOTES, 'local');
  const removedSync = await removeFromStorage(STORAGE_KEYS.QUOTES, 'sync');
  if (!removedLocal || !removedSync) {
    // Emptied, not left in place: the copies landed, so a surviving legacy key makes the next read
    // re-add a quote deleted since — or duplicate into the sibling key one favouriting had moved.
    logger.error('Migrated the legacy quotes but could not delete the legacy key; emptying it');
    if (!removedLocal) {
      await setInStorage(STORAGE_KEYS.QUOTES, [], 'local');
    }
    if (!removedSync) {
      await setInStorage(STORAGE_KEYS.QUOTES, [], 'sync');
    }
  }

  logger.info(
    `Migration complete: ${seedQuotes.length} seed quotes, ${customQuotes.length} custom quotes`
  );
}

/**
 * Throws rather than answering `[]` when storage could not be read: an empty answer is what the
 * store seeds on, and seeding rewrites both quote keys — erasing every custom quote.
 */
export async function getQuotes(): Promise<Quote[]> {
  // Raw: this only decides whether to migrate, and the migration itself must see everything that
  // is there. A read it could not make throws rather than skipping the migration silently.
  const legacyQuotes = await readLegacyQuotes('local');
  if (legacyQuotes !== null && legacyQuotes.length > 0) {
    await migrateLegacyQuotes();
  }

  // getListRaw, not the validated read: only a key that was never written reads as empty here.
  const seedRaw = await getListRaw<unknown>(STORAGE_KEYS.SEED_QUOTES, 'local');
  const area = await getStorageArea();
  const customRaw = await getListRaw<unknown>(STORAGE_KEYS.CUSTOM_QUOTES, area);

  return [
    ...keepValidListItems<Quote>(seedRaw, quoteSchema, STORAGE_KEYS.SEED_QUOTES, 'local'),
    ...keepValidListItems<Quote>(customRaw, quoteSchema, STORAGE_KEYS.CUSTOM_QUOTES, area),
  ];
}

export async function setQuotes(quotes: Quote[]): Promise<StorageResult> {
  try {
    // Split into seed and custom quotes
    const seedQuotes = quotes.filter((q) => !isCustomQuote(q));
    const customQuotes = quotes.filter((q) => isCustomQuote(q));
    // Both keys judge preservation against every id this write covers: favouriting moves a quote
    // to the sibling key, and a per-key view would keep its quarantined twin beside the new copy.
    const coveredIds = quotes.map((q) => q.id);

    // Store seed quotes in local storage
    const seedResult = await setValidatedListInStorage(
      STORAGE_KEYS.SEED_QUOTES,
      seedQuotes,
      quoteSchema,
      'local',
      coveredIds
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
      area,
      coveredIds
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
  if (events.length === stored.events.length) {
    return { ...stored, events };
  }
  logger.warn('Dropped unreadable cached calendar events', {
    dropped: stored.events.length - events.length,
    of: stored.events.length,
  });
  // `lastSync` goes too, or the store reads it as `syncedToday`, skips its refetch and shows
  // the gaps as the user's agenda for the rest of the day.
  return { ...stored, events, lastSync: null };
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

const SETTINGS_SYNC_ENABLED_KEY = settingsStorageKey('syncEnabled');

/**
 * The migration's completion flag, read out of a batch the caller already needed. Only an
 * explicit `true` counts: absent, unreadable or any other value means the blob is still the
 * back-stop, which is the safe answer for a migration that may never have run.
 */
function settingsMigrationCompleted(stored: StoredValues): boolean {
  const entry = stored[STORAGE_KEYS.SETTINGS_MIGRATED];
  return entry?.readable === true && entry.value === true;
}

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

/**
 * A field of the legacy blob, judged exactly as the migration judges it — a value it would have
 * discarded must not reach `getSettingsForSync` and be pushed to every other device.
 *
 * Read through from disk rather than cached: the blob survives only until a migration write
 * succeeds and deletes it, so two realms cannot disagree about what it still holds, and a reset
 * that deletes it is visible to both at once.
 */
function legacySettingsField(blob: unknown, key: string): unknown {
  if (blob === null || typeof blob !== 'object' || Array.isArray(blob)) {
    return undefined;
  }
  if (!Object.hasOwn(blob, key)) {
    return undefined;
  }
  const value = (blob as Record<string, unknown>)[key];
  if (!settingsValueIsValid(key, value)) {
    return undefined;
  }
  return value;
}

interface SettingsEntries {
  values: Record<string, unknown>;
  /** Stored but unreadable — not the same as never written, and never defaulted silently. */
  unreadable: string[];
}

// Nothing to seed for a key this build cannot name: it sits in its own entry, which no patch
// rewrites. Null when the read failed, so no caller mistakes that for a stored default.
async function readSettingsEntries(): Promise<SettingsEntries | null> {
  await ensureSettingsMigrated();
  const stored = await getManyFromStorage(
    [...SETTINGS_STORAGE_KEYS, STORAGE_KEYS.SETTINGS, STORAGE_KEYS.SETTINGS_MIGRATED],
    'local'
  );
  if (stored === null) {
    return null;
  }
  // Once flagged the blob is a backup, not a source: consulting it would freeze every default it
  // still holds a value for, which is the whole reason the per-key entries are sparse.
  const migrated = settingsMigrationCompleted(stored);
  const blobEntry = stored[STORAGE_KEYS.SETTINGS];
  // An unreadable blob blinds every key it would have back-stopped: those keys have no per-key
  // entry, so "absent" here would mean the default, which is a guess about a value that is there.
  const blobUnreadable = !migrated && blobEntry !== undefined && !blobEntry.readable;
  let blob: unknown;
  if (!migrated && blobEntry?.readable === true) {
    blob = blobEntry.value;
  }
  const values: Record<string, unknown> = {};
  const unreadable: string[] = [];
  for (const key of SETTINGS_KEYS) {
    const entry = stored[settingsStorageKey(key)];
    if (entry === undefined) {
      if (blobUnreadable) {
        unreadable.push(key);
      } else {
        values[key] = legacySettingsField(blob, key);
      }
    } else if (entry.readable) {
      values[key] = entry.value;
    } else {
      unreadable.push(key);
    }
  }
  return { values, unreadable };
}

/**
 * A refusal names the corrupt fields; an empty `unreadable` means the read itself failed, which
 * no reset can fix and no field name describes.
 */
export type SettingsRead = { ok: true; settings: Settings } | { ok: false; unreadable: string[] };

/**
 * `ok: false` when any field could not be read — for callers that must not act on a guess. A field
 * that is stored but unreadable is refused too, not defaulted: `autoRollDueTasks` defaults to on,
 * so defaulting it re-dates every overdue task of a user who turned it off, on every device.
 * `getSettings` is the display path and defaults field-wise; a gate would read that as consent.
 */
export async function readSettings(): Promise<SettingsRead> {
  const entries = await readSettingsEntries();
  if (entries === null) {
    logger.error('Could not read the stored settings; refusing to answer with defaults');
    return { ok: false, unreadable: [] };
  }
  if (entries.unreadable.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.error('Refusing to default settings fields that are stored but unreadable', {
      fields: entries.unreadable,
    });
    return { ok: false, unreadable: entries.unreadable };
  }
  return {
    ok: true,
    settings: { ...DEFAULT_SETTINGS, ...keepReadableSettingsFields(entries.values) },
  };
}

export async function getSettings(): Promise<Settings> {
  const entries = await readSettingsEntries();
  if (entries === null) {
    logger.error('Could not read the stored settings; using defaults for this read');
    return { ...DEFAULT_SETTINGS };
  }
  if (entries.unreadable.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.error('Defaulting settings fields that are stored but unreadable', {
      fields: entries.unreadable,
    });
  }
  return { ...DEFAULT_SETTINGS, ...keepReadableSettingsFields(entries.values) };
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
  // Migrate first: the migration reads an absent per-key entry as a gap to fill, so one still in
  // flight would write the cleared values back in behind the reset.
  await ensureSettingsMigrated();
  // Enumerated, not derived from DEFAULT_SETTINGS: the migration carries unknown keys across and
  // sync writes whatever a newer peer sends, so a build-time list leaves them to resurface.
  const stored = await listStorageKeys(SETTINGS_KEY_PREFIX, 'local');
  if (stored === null) {
    logger.error('Could not list the stored settings keys; nothing was reset');
    return false;
  }
  // The blob goes too — a reset should not leave a copy of what it cleared — but never the
  // completion flag, which is what stops the migration restoring the blob's values afterwards.
  const toRemove = new Set([...SETTINGS_STORAGE_KEYS, ...stored, STORAGE_KEYS.SETTINGS]);
  return removeManyFromStorage([...toRemove], 'local');
}

/**
 * The legacy blob, with the cases the migration has to tell apart: never stored, stored but not
 * readable as settings, and readable. Null when the read itself failed.
 */
type LegacyBlobEntry = { stored: false } | { stored: true; blob: Record<string, unknown> | null };

async function readLegacyBlobEntry(): Promise<LegacyBlobEntry | null> {
  const stored = await getManyFromStorage([STORAGE_KEYS.SETTINGS], 'local');
  if (stored === null) {
    return null;
  }
  const entry = stored[STORAGE_KEYS.SETTINGS];
  if (entry === undefined) {
    return { stored: false };
  }
  if (!entry.readable) {
    return { stored: true, blob: null };
  }
  const value = entry.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { stored: true, blob: null };
  }
  return { stored: true, blob: value as Record<string, unknown> };
}

/** Written last, and only after the per-key entries land: it retires the blob as a source. */
async function markSettingsMigrated(): Promise<boolean> {
  const result = await setInStorage(STORAGE_KEYS.SETTINGS_MIGRATED, true, 'local');
  if (!result.success) {
    logger.error('Could not flag the settings migration; it will run again', result.error);
    return false;
  }
  return true;
}

/**
 * One-time copy from the legacy settings blob into per-key entries. Idempotent and safe to run in
 * more than one realm: it fills only gaps, so a value a sync pull already wrote is never clobbered,
 * and it writes nothing at all through the store, so no key is ever marked dirty for sync.
 *
 * The blob is kept, not deleted — the flag is what retires it as a source, so clearing the flag
 * puts every read back on the blob. A later release deletes it once nobody needs the rollback.
 *
 * Resolves false when the move has to be retried; the read-through keeps serving the blob
 * meanwhile, so an incomplete migration costs nothing but a later attempt.
 */
export async function migrateLegacySettings(): Promise<boolean> {
  const flag = await getManyFromStorage([STORAGE_KEYS.SETTINGS_MIGRATED], 'local');
  if (flag !== null && settingsMigrationCompleted(flag)) {
    return true;
  }

  const legacy = await readLegacyBlobEntry();
  if (legacy === null) {
    logger.error('Could not read the legacy settings blob; the migration will run again');
    return false;
  }
  if (!legacy.stored) {
    // Fresh install: nothing to copy, and the flag is what stops this repeating on every read.
    return markSettingsMigrated();
  }
  if (legacy.blob === null) {
    // Flagging here would retire a back-stop this build never copied a single value out of.
    logger.error('The legacy settings blob is unreadable; leaving it unmigrated');
    return false;
  }
  const blob = legacy.blob;

  const existing = await getManyFromStorage(Object.keys(blob).map(settingsStorageKey), 'local');
  if (existing === null) {
    // Every key would look like a gap, so the blob's older values would overwrite what a sync
    // pull already wrote.
    logger.error('Could not read the per-key settings entries; the migration will run again');
    return false;
  }
  const patch: Record<string, unknown> = {};
  const discarded: string[] = [];
  for (const [key, value] of Object.entries(blob)) {
    const storageKey = settingsStorageKey(key);
    // An unreadable entry is filled too: its bytes are garbage no read can use, so the blob's
    // value is strictly better than leaving it.
    const entry = existing[storageKey];
    if (entry?.readable === true) {
      continue;
    }
    const fieldSchema = settingsFieldSchema(key);
    if (fieldSchema === undefined) {
      // A key this build does not know, carried across so the flag does not strand it.
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

  // Before the flag, never after: the flag is what stops the read-through consulting the blob,
  // so a flag that outran its entries would default every key the write never landed.
  if (Object.keys(patch).length > 0) {
    const result = await setManyInStorage(patch, 'local');
    if (!result.success) {
      // Unflagged, so every settings read still falls back through the blob, and `syncEnabled`
      // decides which area the rest of the data lives in.
      logger.error('Settings migration write failed; leaving it unflagged', result.error);
      return false;
    }
  }

  if (discarded.length > 0) {
    // Names only — a setting's value can be a goal id or a playlist the user picked.
    logger.error('Dropping legacy settings values that do not match their schema', {
      fields: discarded,
    });
  }

  return markSettingsMigrated();
}

let settingsMigration: Promise<void> | null = null;

/**
 * Runs the legacy-blob migration once per realm; every settings read awaits it, so no
 * caller has to order it. migrateLegacySettings must never call this — it reads and writes with
 * an explicit 'local' area rather than through getStorageArea, which keeps that from recursing.
 */
export function ensureSettingsMigrated(): Promise<void> {
  if (settingsMigration === null) {
    // Neither an incomplete run nor a rejection is memoized: getStorageArea awaits this on nearly
    // every storage call, so a cached failure would freeze the migration for the whole session.
    settingsMigration = migrateLegacySettings()
      .then((completed) => {
        if (!completed) {
          settingsMigration = null;
        }
      })
      .catch((error: unknown) => {
        settingsMigration = null;
        throw error;
      });
  }
  return settingsMigration;
}

/** Drops the memo so the next read migrates again. For test isolation. */
export function resetSettingsMigration(): void {
  settingsMigration = null;
}

/**
 * Raw list reads for the sync engine. An item hidden from `readAll` is deleted by the next
 * `writeOne`, and its absence is how the cycle infers a tombstone for every other device.
 *
 * So only a key that was never written reads as `[]`. A read that failed and a stored value this
 * build cannot use both throw: a wedged collection is recoverable, a fleet-wide erase is not.
 * The batch read is what separates the two — `get` answers `null` for either.
 */
async function getListRaw<T>(key: string, area: StorageArea): Promise<T[]> {
  const stored = await getManyFromStorage([key], area);
  if (stored === null) {
    throw new Error(`Could not read the stored ${key} list`);
  }
  const entry = stored[key];
  if (entry === undefined) {
    return [];
  }
  if (!entry.readable || !Array.isArray(entry.value)) {
    logger.error('Refusing to read a stored list this build cannot use', { key, area });
    throw new Error(`The stored ${key} list is unreadable`);
  }
  // Shape, not content: a null or primitive row carries no id, so nothing can key it and every
  // caller that spreads the list and reads `.id` throws on it. Rows that survive are untouched.
  const rows = entry.value as unknown[];
  const usable = rows.filter((row) => row !== null && typeof row === 'object');
  if (usable.length !== rows.length) {
    logger.error('Dropped rows with no usable shape from a raw list read', {
      key,
      area,
      dropped: rows.length - usable.length,
      of: rows.length,
    });
  }
  return usable as T[];
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
  if (entries === null) {
    // Our defaults would win LWW over the value every peer actually chose.
    throw new Error('Could not read the settings to push: the settings read failed');
  }
  if (entries.unreadable.length > 0) {
    logger.error('Refusing to push settings with unreadable fields', {
      fields: entries.unreadable,
    });
    throw new Error(
      `Could not read the settings to push: ${entries.unreadable.join(', ')} unreadable`
    );
  }
  const present = Object.fromEntries(
    Object.entries(entries.values).filter(([, value]) => value !== undefined)
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

// Storage usage tracking. `available: false` is the only honest answer when the area is unknown:
// a sync user near the 100KB ceiling shown all-clear against 10MB loses the warning that
// explains their next failed write.
export type StorageUsageInfo =
  | {
      available: true;
      bytesInUse: number;
      quota: number;
      percentageUsed: number;
      isWarning: boolean; // > 75%
      isCritical: boolean; // > 90%
    }
  | { available: false };

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
      available: true,
      bytesInUse,
      quota,
      percentageUsed,
      isWarning: percentageUsed > 75,
      isCritical: percentageUsed > 90,
    };
  } catch (error) {
    logger.error('Error getting storage usage', error);
    return { available: false };
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
    // Note: Seed quotes are not migrated (always in local storage)
    const keys = [
      STORAGE_KEYS.CUSTOM_QUOTES,
      STORAGE_KEYS.CURRENT_QUOTE,
      STORAGE_KEYS.GOALS,
      STORAGE_KEYS.REMINDERS,
      STORAGE_KEYS.POMODORO_SESSIONS,
      STORAGE_KEYS.COLLECTIONS,
      STORAGE_KEYS.QUICK_LINKS,
      STORAGE_KEYS.CONCEPT_CARDS,
    ];
    // One batch read, so "the source holds nothing here" is told apart from "the source could not
    // be read" — the second answered as the first copies emptiness over the destination.
    const source = await getManyFromStorage(keys, fromArea);
    if (source === null) {
      logger.error(`Could not read the ${fromArea} area; nothing was migrated`);
      return storageFailure(`Could not read the ${fromArea} storage area`);
    }
    const unreadable = keys.filter((key) => source[key]?.readable === false);
    if (unreadable.length > 0) {
      logger.error(`Refusing to migrate unreadable ${fromArea} data`, { keys: unreadable });
      return storageFailure(`Unreadable data in the ${fromArea} storage area: ${unreadable[0]}`);
    }

    // Only what the source actually holds: a key it never wrote has nothing to copy, and
    // writing `[]` for it would delete whatever the destination still has.
    const results: StorageResult[] = [];
    for (const key of keys) {
      const entry = source[key];
      if (entry?.readable === true) {
        results.push(await setInStorage(key, entry.value, toArea));
      }
    }

    // Check if any operation failed
    const failedResult = results.find((r) => !r.success);
    if (failedResult) {
      return failedResult;
    }

    logger.info(`Successfully migrated ${results.length} keys from ${fromArea} to ${toArea}`);
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
