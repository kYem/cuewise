/**
 * Platform seams for scheduling wake-ups and delivering OS notifications.
 * Interfaces only — implementations live per-app (Chrome extension, Tauri).
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
