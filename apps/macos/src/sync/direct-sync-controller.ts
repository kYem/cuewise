import type { EnableResult, SyncController, SyncUiStatus } from '@cuewise/app';
import { type KeyValueStore, logger, type Scheduler } from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import {
  createSyncEngine,
  RecoveryCodeError,
  RecoveryCodeRequiredError,
  type SyncEngine,
  type SyncEngineControlSurface,
  type SyncSignInProvider,
  type SyncStatus,
} from '@cuewise/sync-engine';

/** Exported so tests can assert against it without duplicating the literal. */
export const LAST_SYNC_CREDS_KEY = 'cuewise.sync.lastCreds';

interface LastSyncCreds {
  accountId: string;
  deviceName: string;
}

/** Trampoline callbacks handed to the engine at construction (E4) — never post-hoc attached. */
interface EngineTrampolines {
  onStatus: (status: SyncStatus) => void;
  onQuarantine: (key: string) => void;
  onRecoveryCode: (code: string) => void;
}

export interface CreateDirectSyncControllerOptions {
  baseUrl: string;
  keyStore: KeyValueStore;
  scheduler: Scheduler;
  /** Fires on quarantine (never the recovery code/credential/token — those are secrets). */
  toast?: (message: string) => void;
}

export interface DirectSyncControllerHandle<E extends SyncEngineControlSurface = SyncEngine> {
  controller: SyncController;
  engine: E;
}

/** spec §1: SyncStatus (engine) -> SyncUiStatus (controller-facing). */
function mapStatus(status: SyncStatus): SyncUiStatus {
  if (status === 'disabled') {
    return 'off';
  }
  if (
    status === 'signing_in' ||
    status === 'key_init' ||
    status === 'enrolling' ||
    status === 'initial_sync'
  ) {
    return 'connecting';
  }
  if (status === 'active') {
    return 'active';
  }
  if (status === 'error') {
    return 'error';
  }
  if (status === 'signed_out') {
    return 'needs_reauth';
  }
  // Exhaustiveness guard: a new SyncStatus member is a compile error here, not a silent fallthrough.
  const exhaustive: never = status;
  throw new Error(`unmapped sync status: ${String(exhaustive)}`);
}

interface BuildDirectSyncControllerDeps<E extends SyncEngineControlSurface> {
  keyStore: KeyValueStore;
  toast?: (message: string) => void;
  /** Constructs the engine WITH the trampolines (E4) — production wires createSyncEngine, tests wire a real SyncEngine over fakes. */
  buildEngine: (trampolines: EngineTrampolines) => E;
}

/**
 * Core adapter logic, engine-construction-agnostic so it can be exercised against a real
 * SyncEngine over fakes in tests. `createDirectSyncController` is the production entry point.
 */
export function buildDirectSyncController<E extends SyncEngineControlSurface>(
  deps: BuildDirectSyncControllerDeps<E>
): DirectSyncControllerHandle<E> {
  const subscribers = new Set<(status: SyncUiStatus) => void>();
  let cachedStatus: SyncUiStatus = 'off';
  let capturedRecoveryCode: string | undefined;

  function emit(status: SyncUiStatus): void {
    cachedStatus = status;
    for (const subscriber of subscribers) {
      subscriber(status);
    }
  }

  const engine = deps.buildEngine({
    onStatus: (status) => emit(mapStatus(status)),
    onQuarantine: (key) => {
      if (deps.toast) {
        deps.toast(`Some synced data couldn't be decrypted and was skipped (${key}).`);
      }
    },
    // One-shot capture slot: enable()/reconnect() arm+read it under the mutex below.
    onRecoveryCode: (code) => {
      capturedRecoveryCode = code;
    },
  });

  cachedStatus = mapStatus(engine.getStatus());

  async function persistCreds(creds: LastSyncCreds): Promise<void> {
    const result = await deps.keyStore.set(LAST_SYNC_CREDS_KEY, creds, 'local');
    if (!result.success) {
      logger.error('Failed to persist sync credentials for reconnect', result.error);
    }
  }

  async function loadCreds(): Promise<LastSyncCreds | null> {
    return deps.keyStore.get<LastSyncCreds>(LAST_SYNC_CREDS_KEY, 'local');
  }

  // enable()/reconnect() build EnableResult from the thrown error AND the post-call status
  // (spec §4/§0-E4) — a 401 during initial sync returns rather than throws.
  async function doEnable(
    provider: SyncSignInProvider,
    credential: string,
    deviceName: string,
    recoveryCode?: string
  ): Promise<EnableResult> {
    capturedRecoveryCode = undefined;
    try {
      await engine.enableSync(provider, credential, deviceName, recoveryCode);
    } catch (err) {
      if (err instanceof RecoveryCodeRequiredError) {
        return { ok: false, reason: 'needs-code' };
      }
      if (err instanceof RecoveryCodeError) {
        return { ok: false, reason: 'bad-code', detail: err.kind };
      }
      if (err instanceof ApiError && err.status === 401) {
        return { ok: false, reason: 'auth' };
      }
      const detail = err instanceof Error ? err.message : String(err);
      // Surface the real cause in the message text (parity with the extension's handler).
      logger.error(`Cloud sync enable failed: ${detail}`, err);
      return { ok: false, reason: 'error', detail };
    }
    if (engine.getStatus() === 'signed_out') {
      return { ok: false, reason: 'auth' };
    }
    await persistCreds({ accountId: credential, deviceName });
    const capturedCode = capturedRecoveryCode;
    capturedRecoveryCode = undefined;
    return { ok: true, recoveryCode: capturedCode };
  }

  // Promise-chain mutex: enable()/reconnect() share the one capture slot above, so two
  // concurrent callers must never run doEnable overlapping — the second waits for the first.
  let mutex: Promise<unknown> = Promise.resolve();
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = mutex.then(fn, fn);
    mutex = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  const controller: SyncController = {
    getStatus(): SyncUiStatus {
      return cachedStatus;
    },
    subscribe(cb: (status: SyncUiStatus) => void): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    enable(accountId, deviceName, recoveryCode): Promise<EnableResult> {
      return serialize(() => doEnable('dev', accountId, deviceName, recoveryCode));
    },
    // Deep-link OAuth for macOS is a separate follow-up (ENG-43); Google sign-in is Chrome-only for now.
    async enableWithGoogle(_deviceName: string, _recoveryCode?: string): Promise<EnableResult> {
      return {
        ok: false,
        reason: 'error',
        detail: 'Google sign-in on macOS is not available yet',
      };
    },
    reconnect(recoveryCode?: string): Promise<EnableResult> {
      return serialize(async () => {
        const creds = await loadCreds();
        if (creds === null) {
          return { ok: false, reason: 'error' };
        }
        // No code = silent re-auth via persisted DK (E2); a code enrolls this device after reconnect.
        return doEnable('dev', creds.accountId, creds.deviceName, recoveryCode);
      });
    },
    async disable(): Promise<void> {
      await engine.disableSync();
    },
    async regenerateRecoveryCode(): Promise<string> {
      return engine.regenerateRecoveryCode();
    },
    async syncNow(): Promise<void> {
      emit('syncing');
      // Reconcile in finally so an engine throw doesn't strand the pill on "Syncing…".
      try {
        await engine.syncNow();
      } finally {
        emit(mapStatus(engine.getStatus()));
      }
    },
  };

  return { controller, engine };
}

/**
 * Production factory: builds the real SyncEngine WITH its own trampoline callbacks (E4) and
 * adapts it to the platform-agnostic SyncController seam the enable-sync UI drives.
 */
export function createDirectSyncController(
  opts: CreateDirectSyncControllerOptions
): DirectSyncControllerHandle<SyncEngine> {
  return buildDirectSyncController<SyncEngine>({
    keyStore: opts.keyStore,
    toast: opts.toast,
    buildEngine: (trampolines) =>
      createSyncEngine({
        baseUrl: opts.baseUrl,
        keyStore: opts.keyStore,
        scheduler: opts.scheduler,
        ...trampolines,
      }),
  });
}
