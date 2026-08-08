import {
  CONTENT_SETTINGS_KEYS,
  type ColorTheme,
  clampBackgroundEffects,
  clampNoteLength,
  clampPomodoroDurations,
  configureLogger,
  DEFAULT_SETTINGS,
  DEVICE_LOCAL_SETTINGS_KEYS,
  describeThrown,
  type LayoutDensity,
  LogLevel as LoggerLevel,
  logger,
  notifyMutated,
  type ObservableKeyValueStore,
  type Settings,
  type StorageError,
} from '@cuewise/shared';
import {
  clearSettings,
  getSettings,
  migrateStorageData,
  readSettings,
  SETTINGS_KEY_PREFIX,
  SETTINGS_KEYS,
  type SettingsRead,
  setSettingsPatch,
} from '@cuewise/storage';
import { create } from 'zustand';
import { observableStorage, safeSubscribe } from './storage-changes';
import { useToastStore } from './toast-store';

// Exactly the keys with preview-aware selectors; widen only alongside a new selector.
export type PreviewableSettings = Pick<Settings, 'backgroundDim' | 'backgroundBlur'>;

/** The latch dedupes on the whole message, so the two paths must not share a cost clause. */
type FailureCost = 'what you see may be out of date' | 'the change was not saved';

function unreadableSettingsMessage(unreadable: string[], cost: FailureCost): string {
  if (unreadable.length > 0) {
    const subject = unreadable.length === 1 ? 'value' : 'values';
    const named = `Cuewise can't read your saved ${subject} for ${unreadable.join(', ')}`;
    return `${named}, so ${cost}. Reset to defaults in Settings to fix it.`;
  }
  return `Cuewise can't read your settings, so ${cost}.`;
}

/** Quota failures get actionable copy; anything else keeps the generic retry message. */
function settingsWriteErrorMessage(error: StorageError, fallback: string): string {
  if (error.type === 'quota_exceeded' || error.type === 'per_item_quota_exceeded') {
    return 'Storage is full — could not save settings. Clear some data to continue.';
  }
  return fallback;
}

/**
 * Overlay entries that differ from what a resolving write just persisted belong to a
 * newer gesture that started while the write was in flight — keep those, drop the rest.
 */
function reconcilePreview(
  preview: Partial<PreviewableSettings> | null,
  persisted: Settings
): Partial<PreviewableSettings> | null {
  if (preview === null) {
    return null;
  }
  const remaining = Object.fromEntries(
    Object.entries(preview).filter(([key, value]) => persisted[key as keyof Settings] !== value)
  ) as Partial<PreviewableSettings>;
  if (Object.keys(remaining).length === 0) {
    return null;
  }
  return remaining;
}

const noop = () => {};

/** Every DOM/logger effect a settings value drives; all idempotent. */
function applyAll(settings: Settings): void {
  applyTheme(settings.theme);
  applyColorTheme(settings.colorTheme);
  applyGlassEnhanced(settings.glassEnhanced);
  applyLayoutDensity(settings.layoutDensity);
  applyLogLevel(settings.logLevel);
}

let observing: { store: ObservableKeyValueStore; unsubscribe: () => void } | null = null;

// Structural for the array-valued keys: both backends parse a fresh array per read, so `===`
// reports "changed" for anyone who has ever touched a quote filter.
function sameSettingValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }
  return left === right;
}

function sameSettings(a: Settings, b: Settings): boolean {
  return SETTINGS_KEYS.every((key) => sameSettingValue(a[key], b[key]));
}

let reportedUnreadable: string | null = null;

/**
 * Latched on its own, not on `error`, which the write path sets too: a pull writes one key at a
 * time, so one problem should say so once — and a different one should still say so.
 */
function reportStale(unreadable: string[]): void {
  const message = unreadableSettingsMessage(unreadable, 'what you see may be out of date');
  if (reportedUnreadable === message) {
    return;
  }
  reportedUnreadable = message;
  useSettingsStore.setState({ error: message });
  useToastStore.getState().error(message);
}

/** Only this module's own latched complaint: a read succeeding says nothing about a write that failed. */
function clearOwnComplaint(): void {
  const complaint = reportedUnreadable;
  reportedUnreadable = null;
  if (complaint !== null && useSettingsStore.getState().error === complaint) {
    useSettingsStore.setState({ error: null });
  }
}

// The sync engine writes settings one key per call, so a burst would otherwise queue one full
// re-read per key.
let refreshQueued = false;

function queueRefresh(): void {
  if (refreshQueued) {
    return;
  }
  refreshQueued = true;
  // Floating on purpose; its own rejection is the only place a throw here can be reported.
  enqueueWrite(async () => {
    refreshQueued = false;
    await refreshFromStorage();
  }).catch((error) => {
    logger.error(`Could not apply settings changed elsewhere: ${describeThrown(error)}`, error);
  });
}

/** Converges the in-memory copy on settings written anywhere else — a pull, or another tab. */
function subscribeToStorage(): void {
  const store = observableStorage();
  if (observing !== null && observing.store === store) {
    return;
  }
  if (observing !== null) {
    observing.unsubscribe();
    observing = null;
  }
  if (store === null) {
    return;
  }
  // Settings are read and written in the local area only, so a `settings.`-prefixed key announced
  // anywhere else names a value this store never reads.
  const unsubscribe = safeSubscribe(store, 'settings', (keys, area) => {
    if (area !== 'local' || !keys.some((key) => key.startsWith(SETTINGS_KEY_PREFIX))) {
      return;
    }
    queueRefresh();
  });
  // Left null on a failed subscribe, so the next initialize() retries rather than believing it
  // is already observing.
  if (unsubscribe !== null) {
    observing = { store, unsubscribe };
  }
}

/**
 * Reads persisted truth rather than trusting the event: by the time this runs another writer may
 * have replaced the value that triggered it. Never calls updateSettings, so it cannot re-enter the
 * write path or re-notify the sync engine about a change that came FROM it.
 */
async function refreshFromStorage(): Promise<void> {
  let read: SettingsRead;
  try {
    read = await readSettings();
  } catch (error) {
    // readSettings rejects as well as answering `ok:false` — an unconfigured registry throws — and
    // a silently stale view is worse than a loud one.
    logger.error(
      `Could not re-read settings after a storage change: ${describeThrown(error)}`,
      error
    );
    reportStale([]);
    return;
  }
  if (!read.ok) {
    // An empty list is the read itself failing, not zero unreadable fields.
    logger.error('Settings changed elsewhere could not be read; the shown values are stale', {
      fields: read.unreadable.length > 0 ? read.unreadable : 'the read failed',
    });
    reportStale(read.unreadable);
    return;
  }
  // Before the no-op check: a reset that fixes the value converges on what this store already holds.
  clearOwnComplaint();
  const { settings, preview } = useSettingsStore.getState();
  // A key names a write, not a changed value, so an own write arrives here as a no-op.
  if (sameSettings(settings, read.settings)) {
    return;
  }
  useSettingsStore.setState({
    settings: read.settings,
    preview: reconcilePreview(preview, read.settings),
  });
  applyAll(read.settings);
}

// Storage writes are per-key now and don't race, but each write still reads fresh settings to
// compute the in-memory merge and notify diff — chaining keeps that read/set pair atomic per write.
let writeChain: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(run: () => Promise<T>): Promise<T> {
  const result = writeChain.then(run, run);
  // Park the chain on a settled promise so one failure can't poison every later write.
  writeChain = result.then(noop, noop);
  return result;
}

export interface SettingsStore {
  // State
  settings: Settings;
  // Ephemeral overlay for live slider previews; never persisted. A commit drops the
  // entries it persisted (newer in-flight gestures survive); failures drop it whole.
  // Kept out of `settings` so updateSettings still diffs against persisted truth.
  preview: Partial<PreviewableSettings> | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  previewSettings: (settings: Partial<PreviewableSettings>) => void;
  clearPreview: () => void;
  // Both resolve true only when the write actually persisted, so callers can
  // gate "saved" affordances — the storage adapters report failure via the
  // result object rather than throwing.
  updateSettings: (settings: Partial<Settings>) => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // Initial state
  settings: DEFAULT_SETTINGS,
  preview: null,
  isLoading: true,
  error: null,

  previewSettings: (partialSettings: Partial<PreviewableSettings>) => {
    const { preview } = get();
    set({ preview: { ...preview, ...partialSettings } });
  },

  clearPreview: () => {
    set({ preview: null });
  },

  initialize: () =>
    // In the write queue, not beside it: an init resolving after a write would otherwise install
    // the settings it read BEFORE that write, reverting it in memory until the next reload.
    enqueueWrite(async () => {
      try {
        subscribeToStorage();
        reportedUnreadable = null;
        set({ isLoading: true, error: null });

        const settings = await getSettings();

        set({ settings, preview: null, isLoading: false });
        applyAll(settings);
      } catch (error) {
        logger.error('Error initializing settings store', error);
        const errorMessage = 'Failed to load settings. Please refresh the page.';
        set({ error: errorMessage, isLoading: false });
        useToastStore.getState().error(errorMessage);
      }
    }),

  updateSettings: (partialSettings: Partial<Settings>) =>
    enqueueWrite(async () => {
      try {
        // Re-reads settings because a sync pull or a pre-init click can beat this write; the read
        // feeds the merge base and changed-key diff below — the write itself is a sparse per-key patch.
        // Fail-closed: defaults as the base would read `syncEnabled: false` as the user's choice,
        // skipping the area migration while still writing the flag.
        const read = await readSettings();
        if (!read.ok) {
          logger.error('Aborted a settings update: the current settings could not be read', {
            fields: Object.keys(partialSettings),
          });
          const errorMessage = unreadableSettingsMessage(
            read.unreadable,
            'the change was not saved'
          );
          // Latched so a later good read can retire it.
          reportedUnreadable = errorMessage;
          set({ error: errorMessage, preview: null });
          // Collapsed on every updateSettings failure path: the notes widget retries a failed
          // write on each pause in typing, which would otherwise stack identical toasts.
          useToastStore.getState().error(errorMessage, { collapseRepeats: true });
          return false;
        }
        clearOwnComplaint();
        const settings = read.settings;

        // Clamp ranged values here — the settings write path the UI uses — so
        // presets/steppers (and a future settings import) can't persist an out-of-range
        // value. Inside the try so a future throwing clamp is caught here.
        const clampedPartial = clampBackgroundEffects(
          clampPomodoroDurations(clampNoteLength(partialSettings))
        );
        const updatedSettings = { ...settings, ...clampedPartial };

        // Check if syncEnabled changed
        const syncChanged =
          partialSettings.syncEnabled !== undefined &&
          partialSettings.syncEnabled !== settings.syncEnabled;

        // If sync setting changed, migrate data before saving settings
        if (syncChanged) {
          const fromArea = settings.syncEnabled ? 'sync' : 'local';
          const toArea = partialSettings.syncEnabled ? 'sync' : 'local';

          useToastStore.getState().success(`Migrating data to ${toArea} storage...`);
          const migrateResult = await migrateStorageData(fromArea, toArea);

          if (!migrateResult.success) {
            let errorMessage = 'Failed to migrate data. Please try again.';

            // Provide specific error message for quota errors
            if (migrateResult.error.type === 'per_item_quota_exceeded') {
              errorMessage = `Cannot enable sync: "${migrateResult.error.key}" exceeds the 8KB per-item limit. Try clearing old data first.`;
            } else if (migrateResult.error.type === 'quota_exceeded') {
              errorMessage =
                'Cannot enable sync: Your data exceeds the 100KB sync storage limit. Try clearing old data first.';
            }

            set({ error: errorMessage, preview: null });
            useToastStore.getState().error(errorMessage);
            return false;
          }
        }

        // The storage adapters never throw — failures come back as a result object,
        // so an unchecked write would silently claim success on e.g. quota exhaustion.
        const writeResult = await setSettingsPatch(clampedPartial);
        if (!writeResult.success) {
          logger.error('Error persisting settings', writeResult.error);
          const errorMessage = settingsWriteErrorMessage(
            writeResult.error,
            'Failed to update settings. Please try again.'
          );
          set({ error: errorMessage, preview: null });
          useToastStore.getState().error(errorMessage, { collapseRepeats: true });
          return false;
        }
        set({
          settings: updatedSettings,
          preview: reconcilePreview(get().preview, updatedSettings),
        });

        // Sync every changed key that isn't device-local (each setting syncs per-key, spec §2).
        for (const key of Object.keys(clampedPartial)) {
          if (
            !DEVICE_LOCAL_SETTINGS_KEYS.includes(key) &&
            !sameSettingValue(
              updatedSettings[key as keyof Settings],
              settings[key as keyof Settings]
            )
          ) {
            notifyMutated('settings', key);
          }
        }

        // Off the merged result, not the incoming patch: a pull can change these without this
        // write touching them.
        applyAll(updatedSettings);
        return true;
      } catch (error) {
        logger.error('Error updating settings', error);
        const errorMessage = 'Failed to update settings. Please try again.';
        // Drop any preview too, so the visible state snaps back to persisted truth.
        set({ error: errorMessage, preview: null });
        useToastStore.getState().error(errorMessage, { collapseRepeats: true });
        return false;
      }
    }),

  resetToDefaults: () =>
    enqueueWrite(async () => {
      try {
        // Removing the keys, not writing defaults over them: a reset means "follow the
        // defaults again", and a stored copy would pin today's values against a later change.
        const cleared = await clearSettings();
        if (!cleared) {
          logger.error('Error clearing settings');
          const errorMessage = 'Failed to reset settings. Please try again.';
          set({ error: errorMessage, preview: null });
          useToastStore.getState().error(errorMessage);
          return false;
        }
        // clearSettings left the content keys stored, so the in-memory copy keeps them too —
        // and their values did not change, so they are not announced to sync below.
        const kept = Object.fromEntries(
          CONTENT_SETTINGS_KEYS.map((key) => [key, get().settings[key as keyof Settings]])
        );
        const reset = { ...DEFAULT_SETTINGS, ...kept };
        set({ settings: reset, preview: null });
        // Not left to the change subscription: the refresh it queues runs behind this write, and
        // a backend that cannot observe writes never delivers an event at all.
        clearOwnComplaint();
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
          if (!DEVICE_LOCAL_SETTINGS_KEYS.includes(key) && !CONTENT_SETTINGS_KEYS.includes(key)) {
            notifyMutated('settings', key);
          }
        }
        applyAll(reset);
        return true;
      } catch (error) {
        logger.error('Error resetting settings', error);
        const errorMessage = 'Failed to reset settings. Please try again.';
        set({ error: errorMessage, preview: null });
        useToastStore.getState().error(errorMessage);
        return false;
      }
    }),
}));

// Preview-aware selectors: consumers see the in-progress drag, falling back to persisted settings.
export function selectBackgroundDim(state: SettingsStore): number {
  return state.preview?.backgroundDim ?? state.settings.backgroundDim;
}

export function selectBackgroundBlur(state: SettingsStore): number {
  return state.preview?.backgroundBlur ?? state.settings.backgroundBlur;
}

/**
 * Apply theme to the document
 */
function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement;

  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else if (theme === 'auto') {
    // Use system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}

/**
 * Apply color theme to the document
 * Using Tailwind v4's @layer theme approach - just set data attribute, CSS handles the rest
 */
function applyColorTheme(colorTheme: ColorTheme) {
  document.documentElement.setAttribute('data-theme', colorTheme);
}

/**
 * Toggle the opt-in Glass enhancement. The CSS keys off `[data-theme="glass"].glass-enhanced`.
 */
function applyGlassEnhanced(enabled: boolean) {
  document.documentElement.classList.toggle('glass-enhanced', enabled);
}

/**
 * Apply layout density to the document
 * Using Tailwind v4's @layer theme approach - just set data attribute, CSS handles the rest
 */
function applyLayoutDensity(density: LayoutDensity) {
  document.documentElement.setAttribute('data-density', density);
}

/**
 * Configure global logger based on settings
 */
function applyLogLevel(logLevel: Settings['logLevel']) {
  if (logLevel === 'none') {
    configureLogger({ enabled: false });
  } else {
    // Map our LogLevel type to the logger's LogLevel enum
    const levelMap: Record<Exclude<Settings['logLevel'], 'none'>, LoggerLevel> = {
      debug: LoggerLevel.DEBUG,
      info: LoggerLevel.INFO,
      warn: LoggerLevel.WARN,
      error: LoggerLevel.ERROR,
    };

    configureLogger({
      enabled: true,
      minLevel: levelMap[logLevel],
    });
  }
}
