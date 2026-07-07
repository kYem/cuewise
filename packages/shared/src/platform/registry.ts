import type { KeyValueStore, Notifier, Scheduler } from './types';

/**
 * Bootstrap container for the active platform implementations. `configurePlatform`
 * merges — each call overrides only the impls it supplies — so it may run more than
 * once per entry point (e.g. @cuewise/storage self-registers its adapter on import;
 * the app then adds scheduler/notifier). Portable code resolves via the getters.
 */
let scheduler: Scheduler | null = null;
let notifier: Notifier | null = null;
let storage: KeyValueStore | null = null;

export function configurePlatform(impls: {
  scheduler?: Scheduler;
  notifier?: Notifier;
  storage?: KeyValueStore;
}): void {
  if (impls.scheduler !== undefined) {
    scheduler = impls.scheduler;
  }
  if (impls.notifier !== undefined) {
    notifier = impls.notifier;
  }
  if (impls.storage !== undefined) {
    storage = impls.storage;
  }
}

export function getScheduler(): Scheduler {
  if (scheduler === null) {
    throw new Error('Scheduler not configured. Call configurePlatform() at startup.');
  }
  return scheduler;
}

export function getNotifier(): Notifier {
  if (notifier === null) {
    throw new Error('Notifier not configured. Call configurePlatform() at startup.');
  }
  return notifier;
}

export function getStorage(): KeyValueStore {
  if (storage === null) {
    throw new Error('Storage not configured. Call configurePlatform() at startup.');
  }
  return storage;
}

/** Clear the active implementations. Used at re-init and in tests. */
export function resetPlatform(): void {
  scheduler = null;
  notifier = null;
  storage = null;
}
