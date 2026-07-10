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
  get<T>(key: string, area: StorageArea): Promise<T | null>;
  set<T>(key: string, value: T, area: StorageArea): Promise<StorageResult>;
  remove(key: string, area: StorageArea): Promise<boolean>;
  getUsage(area: StorageArea): Promise<StorageUsage>;
}
