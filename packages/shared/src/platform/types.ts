/**
 * Platform ports for scheduling wake-ups, delivering OS notifications, and
 * persisting data — the driven (secondary) ports of a ports-and-adapters setup:
 * portable code drives them out to platform infrastructure. Interfaces only;
 * adapters live at the app edge (`Chrome*` in the extension) or in a shared
 * package (`ChromeKeyValueStore` in @cuewise/storage), and a future Tauri/RN app
 * supplies its own.
 */

/** Command surface: arm/cancel a one-shot wake at a future time, keyed by a caller-owned id. */
export interface Scheduler {
  /**
   * Whether a resident background context (extension service worker, native app
   * loop) delivers scheduled wakes, vs. the page having to poll. Callers read this
   * declared capability off the port rather than inferring it from an incidental
   * global like `chrome.alarms` — whose presence doesn't tell you whether this
   * deployment actually delivers in the background (a page context has it too; a
   * native host may deliver without it).
   */
  readonly deliversInBackground: boolean;
  /**
   * Whether armed wakes survive a full app/process restart (chrome.alarms does;
   * in-memory native timers don't). When false, a resident host must re-arm its
   * pending wakes from storage on startup.
   */
  readonly persistsAcrossRestarts: boolean;
  scheduleAt(id: string, when: Date): Promise<void>;
  cancel(id: string): Promise<void>;
}

/**
 * A resident context that also *fires* wakes — the service worker in the
 * extension, the app loop in Tauri. Command-only contexts (the page, the stores)
 * depend on `Scheduler` instead, so "can't subscribe" is a compile error, not a
 * silent no-op.
 */
export interface SchedulerHost extends Scheduler {
  /** Subscribe to fires; returns an unsubscribe fn. */
  onFire(handler: (id: string) => void | Promise<void>): () => void;
}

export interface NotifyOptions {
  id: string;
  title: string;
  body: string;
  /** Button labels, e.g. ['Done', 'Snooze 5 min']. */
  actions?: string[];
  requireInteraction?: boolean;
}

/** Command surface: deliver/clear an OS notification, keyed by id. */
export interface Notifier {
  notify(opts: NotifyOptions): Promise<void>;
  clear(id: string): Promise<void>;
}

/** A resident context that also routes notification clicks/actions back to handlers. */
export interface NotifierHost extends Notifier {
  onClick(handler: (id: string) => void | Promise<void>): () => void;
  onAction(handler: (id: string, actionIndex: number) => void | Promise<void>): () => void;
}

import type { StoredValues } from './stored-value';

// Storage port. Area is Chrome-shaped ('local' | 'sync'); non-Chrome adapters
// map both onto one backend. Types live here (not @cuewise/storage) so the
// unified registry can reference them without a circular dependency.
export type StorageArea = 'local' | 'sync';

// A failed result always carries a diagnostic; a success never does.
export type StorageResult = { success: true } | { success: false; error: StorageError };

export type StorageErrorType = 'quota_exceeded' | 'per_item_quota_exceeded' | 'unknown';

export interface StorageError {
  type: StorageErrorType;
  message: string;
  // Present for single-key writes; absent for aggregate/migration failures.
  key?: string;
  area?: StorageArea;
}

/** Bytes used and the platform quota for an area. Thresholds are computed by callers. */
export interface StorageUsage {
  bytesInUse: number;
  quota: number;
}

/** Area-aware key/value persistence, returning a detailed StorageResult on writes. */
export interface KeyValueStore {
  /**
   * Whether this backend has a real cross-device sync area (chrome.storage.sync).
   * Local-only backends (a native app, dev/web) map both areas onto one store, so
   * sync-only UI feature-detects off this instead of assuming Chrome.
   */
  readonly supportsSync: boolean;
  get<T>(key: string, area: StorageArea): Promise<T | null>;
  set<T>(key: string, value: T, area: StorageArea): Promise<StorageResult>;
  /**
   * Idempotent, like removeMany: a key that was already absent is removed, not a failure. `false`
   * means the removal itself failed — callers log that, so returning it for "nothing to delete"
   * turns an ordinary disable into an error report.
   */
  remove(key: string, area: StorageArea): Promise<boolean>;
  /**
   * Batch read; `null` when the read failed. Absent keys are omitted from a successful result —
   * absence is meaningful to callers, so a failure must never be reported as one. A key that is
   * stored but unreadable comes back as `{ readable: false }`; see `StoredValue`.
   */
  getMany(keys: string[], area: StorageArea): Promise<StoredValues | null>;
  /**
   * Every stored key starting with `prefix`; `null` when the enumeration failed. Needed to remove
   * keys this build cannot name — a settings key written by a newer version, say.
   */
  keys(prefix: string, area: StorageArea): Promise<string[] | null>;
  /** Batch write. Chrome lands the keys in one call; the localStorage fallback loops and can stop partway. */
  setMany(entries: Record<string, unknown>, area: StorageArea): Promise<StorageResult>;
  /** Batch remove, idempotent: a key that was already absent is removed, not a failure. */
  removeMany(keys: string[], area: StorageArea): Promise<boolean>;
  getUsage(area: StorageArea): Promise<StorageUsage>;
  /**
   * A key names a write that happened, not a value that differs — own writes are reported too and
   * a set is indistinguishable from a remove, so handlers re-read rather than trust the event. A
   * handler that writes back through the store it observes echoes forever.
   *
   * Scope differs by backend: the Chrome adapter sees every write to the area from any context,
   * including code that bypassed this port; the localStorage one sees only writes made through
   * that instance.
   */
  onChanged?(handler: StorageChangeHandler): () => void;
}

export type StorageChangeHandler = (keys: string[], area: StorageArea) => void;

/** A store whose `onChanged` is known present, so callers past the feature test stop re-checking. */
export interface ObservableKeyValueStore extends KeyValueStore {
  onChanged(handler: StorageChangeHandler): () => void;
}

/** Presence, not reachability: subscribing can still throw, which is what `safeSubscribe` is for. */
export function canObserveWrites(store: KeyValueStore): store is ObservableKeyValueStore {
  return store.onChanged !== undefined;
}

/**
 * Outbound HTTP. A port because the Tauri webview is blocked from api.cuewise.app by its
 * production CSP *and* the API's CORS policy, so macOS must route through the native
 * plugin fetch while the extension uses the global.
 */
export type HttpFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Optional sink notified when a store mutates a synced entity. Unlike the ports above,
 * sync is opt-in (ENG-45): the app only configures this once cloud sync is enabled.
 */
export interface SyncMutationSink {
  markMutated(collection: string, entityId: string): Promise<void> | void;
  markDeleted(collection: string, entityId: string): Promise<void> | void;
  // Optional so callers that never bulk-notify (and the no-op no-sink path) stay safe.
  markMutatedBulk?(collection: string, entityIds: string[]): Promise<void> | void;
}
