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
import type { OAuthDriver } from '../platform/oauth-driver';
import { computeCodeChallenge, generateCodeVerifier } from './pkce';

/** Exported so tests can assert against it without duplicating the literal. */
export const LAST_SYNC_CREDS_KEY = 'cuewise.sync.lastCreds';

/** Must exactly match an ALLOWED_RETURN_URIS entry on the server. Exported for tests. */
export const GOOGLE_RETURN_URI = 'cuewise://auth';

// Discriminated on provider so reconnect knows how to re-auth; records persisted before the
// google flow existed lack the field and are read as dev. Never a Google credential/token/
// one-time code — dev's accountId doubles as its fake-auth credential (localhost-only bypass).
type LastSyncCreds =
  | { provider?: 'dev'; accountId: string; deviceName: string }
  | { provider: 'google'; deviceName: string };

/** Narrows a stored creds record so a corrupted/foreign one fails at load, not mid-OAuth-flow. */
function toLastSyncCreds(parsed: unknown): LastSyncCreds | null {
  if (parsed === null || typeof parsed !== 'object') {
    return null;
  }
  const record = parsed as { provider?: unknown; accountId?: unknown; deviceName?: unknown };
  if (typeof record.deviceName !== 'string') {
    return null;
  }
  if (record.provider === 'google') {
    return { provider: 'google', deviceName: record.deviceName };
  }
  const isDevShape = record.provider === 'dev' || record.provider === undefined;
  if (isDevShape && typeof record.accountId === 'string') {
    return { provider: 'dev', accountId: record.accountId, deviceName: record.deviceName };
  }
  return null;
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
  /** Runs the system-browser Google OAuth round-trip (production: createTauriOAuthDriver). */
  oauthDriver: OAuthDriver;
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
  baseUrl: string;
  keyStore: KeyValueStore;
  oauthDriver: OAuthDriver;
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
      logger.error(
        `Failed to persist sync credentials for reconnect: ${result.error.message}`,
        result.error
      );
    }
  }

  async function loadCreds(): Promise<LastSyncCreds | null> {
    return toLastSyncCreds(await deps.keyStore.get<unknown>(LAST_SYNC_CREDS_KEY, 'local'));
  }

  // enable()/reconnect() build EnableResult from the thrown error AND the post-call status
  // (spec §4/§0-E4) — a 401 during initial sync returns rather than throws.
  async function doEnable(
    provider: SyncSignInProvider,
    credential: string,
    deviceName: string,
    recoveryCode?: string,
    codeVerifier?: string
  ): Promise<EnableResult> {
    capturedRecoveryCode = undefined;
    try {
      await engine.enableSync(provider, credential, deviceName, { recoveryCode, codeVerifier });
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
    // A google credential is a burned one-time code — worthless for reconnect, so only the
    // provider marker is persisted; reconnect re-runs the OAuth flow instead.
    if (provider === 'google') {
      await persistCreds({ provider: 'google', deviceName });
    } else {
      await persistCreds({ provider: 'dev', accountId: credential, deviceName });
    }
    const capturedCode = capturedRecoveryCode;
    capturedRecoveryCode = undefined;
    return { ok: true, recoveryCode: capturedCode };
  }

  // NOT serialize()-wrapped: called from inside already-serialized entry points
  // (enableWithGoogle, reconnect) — the promise-chain mutex would deadlock if nested.
  async function googleFlow(deviceName: string, recoveryCode?: string): Promise<EnableResult> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await computeCodeChallenge(codeVerifier);
    const startUrl =
      `${deps.baseUrl}/v1/auth/google/start` +
      `?return_uri=${encodeURIComponent(GOOGLE_RETURN_URI)}&code_challenge=${codeChallenge}`;
    let callbackUrl: string;
    try {
      callbackUrl = await deps.oauthDriver.authorize(startUrl);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error(`Google sign-in flow failed: ${detail}`, err);
      return { ok: false, reason: 'error', detail };
    }
    let params: URLSearchParams;
    try {
      params = new URL(callbackUrl).searchParams;
    } catch {
      logger.error('Google sign-in returned an unparseable callback URL');
      return { ok: false, reason: 'error', detail: 'Malformed sign-in callback' };
    }
    // The server relays failures as a sanitized ?error= instead of a code: access_denied
    // (user cancelled), auth_failed (verification failed), server_error (retryable fault).
    const oauthError = params.get('error');
    if (oauthError !== null) {
      if (oauthError === 'server_error') {
        logger.error('Google sign-in relayed a server-side failure');
        return { ok: false, reason: 'error', detail: 'Sign-in failed on the server' };
      }
      const cancelled = oauthError === 'access_denied';
      // The deep-link URL is attacker-shapeable; never echo its raw values into logs/results.
      logger.warn(
        `Google sign-in did not complete (${cancelled ? 'cancelled at Google' : 'auth failed'})`
      );
      return { ok: false, reason: 'auth', detail: cancelled ? 'cancelled' : undefined };
    }
    const code = params.get('code');
    if (code === null || code === '') {
      return { ok: false, reason: 'error', detail: 'Sign-in callback did not include a code' };
    }
    return doEnable('google', code, deviceName, recoveryCode, codeVerifier);
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
    enableWithGoogle(deviceName: string, recoveryCode?: string): Promise<EnableResult> {
      return serialize(() => googleFlow(deviceName, recoveryCode));
    },
    canEnableWithGoogle(): boolean {
      // Exists whenever the sync feature is configured (VITE_SYNC_API_BASE_URL). The Tauri
      // build compiles in deep-link support; non-Tauri (browser/e2e) fails at authorize()
      // rather than hiding the button.
      return true;
    },
    reconnect(recoveryCode?: string): Promise<EnableResult> {
      return serialize(async () => {
        const creds = await loadCreds();
        if (creds === null) {
          return { ok: false, reason: 'error', detail: 'No saved sync account on this device' };
        }
        if (creds.provider === 'google') {
          // Google can't silently re-auth; the DK is already on device, so a fresh OAuth suffices.
          return googleFlow(creds.deviceName, recoveryCode);
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
    baseUrl: opts.baseUrl,
    keyStore: opts.keyStore,
    oauthDriver: opts.oauthDriver,
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
