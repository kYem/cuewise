/**
 * Platform seams for scheduling wake-ups, delivering OS notifications, and
 * persisting data. Interfaces only — implementations live at the app edge
 * (`Chrome*` in the extension) or in a shared package (`ChromeKeyValueStore` in
 * @cuewise/storage); a future Tauri/RN app supplies its own.
 */

/** Arm/cancel a one-shot wake at a future time, keyed by a caller-owned id. */
export interface Scheduler {
  scheduleAt(id: string, when: Date): Promise<void>;
  cancel(id: string): Promise<void>;
  /**
   * Subscribe where fires are handled (the service worker in the extension, the
   * resident app loop in Tauri). Returns an unsubscribe fn. Optional: contexts
   * that only arm/cancel (e.g. the page) never subscribe.
   */
  onFire?(handler: (id: string) => void | Promise<void>): () => void;
}

export interface NotifyOptions {
  id: string;
  title: string;
  body: string;
  /** Button labels, e.g. ['Done', 'Snooze 5 min']. */
  actions?: string[];
  requireInteraction?: boolean;
}

/** Deliver an OS notification, optionally with action buttons, keyed by id. */
export interface Notifier {
  notify(opts: NotifyOptions): Promise<void>;
  clear(id: string): Promise<void>;
  onClick?(handler: (id: string) => void | Promise<void>): () => void;
  onAction?(handler: (id: string, actionIndex: number) => void | Promise<void>): () => void;
}

// Storage port. Area is Chrome-shaped ('local' | 'sync'); non-Chrome adapters
// map both onto one backend. Types live here (not @cuewise/storage) so the
// unified registry can reference them without a circular dependency.
export type StorageArea = 'local' | 'sync';

export interface StorageResult {
  success: boolean;
  error?: StorageError;
}

export type StorageErrorType = 'quota_exceeded' | 'per_item_quota_exceeded' | 'unknown';

export interface StorageError {
  type: StorageErrorType;
  message: string;
  key: string;
  area: StorageArea;
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
