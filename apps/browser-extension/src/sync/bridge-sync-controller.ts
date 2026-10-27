import type {
  EnableResult,
  LastCycleRead,
  LastSyncCreds,
  SyncController,
  SyncDetails,
  SyncDetailsOptions,
  SyncUiStatus,
} from '@cuewise/app';
import {
  asSyncUiStatus,
  LAST_CYCLE_UNAVAILABLE,
  LAST_SYNC_CREDS_KEY,
  NO_SAVED_SIGN_IN_DETAIL,
} from '@cuewise/app';
import { describeThrown, logger, type SyncSession } from '@cuewise/shared';
import {
  CLOUD_SYNC_ENABLED_KEY,
  type DeleteAccountResult,
  type PairingApprovalResult,
  type PairingPollResult,
  type PendingPairing,
  type SyncNowResult,
  type SyncSignInProvider,
} from '@cuewise/sync-engine';
import type {
  SyncControlMessage,
  SyncControlOp,
  SyncControlResponse,
  SyncOpResponse,
} from './sync-control-messages';
import { QUARANTINE_KEY, STATUS_KEY } from './sync-storage-keys';

const DEFAULT_TIMEOUT_MS = 30000;
// The worker finishes a delete the page stopped waiting for, so a short timeout reports a
// deleted account as failed.
const DELETE_ACCOUNT_TIMEOUT_FACTOR = 4;

// Google OAuth 2.0 authorization endpoint + the OpenID scope for the implicit id_token flow.
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_SCOPE = 'openid email';

type OkResponse<O extends SyncControlOp> = Extract<SyncOpResponse[O], { ok: true }>;
// The success response's runtime kind tag, or null for ops whose success carries none.
type OkKind<O extends SyncControlOp> = OkResponse<O> extends { kind: infer K } ? K : null;

interface FallbackLog<O extends SyncControlOp> {
  unavailable: (response: SyncOpResponse[O] | undefined) => void;
  failed: (error: unknown) => void;
}

export interface BridgeSyncControllerOptions {
  /** Fires on quarantine (never the recovery code/credential/token — those are secrets). */
  toast?: (message: string) => void;
  timeoutMs?: number;
  /** OAuth client id for chrome.identity.launchWebAuthFlow; unset disables enableWithGoogle. */
  googleClientId?: string;
}

// needs-code is a finished sign-in, and pairing completes the enroll without returning here.
function signedIn(response: EnableResult): boolean {
  if (response.ok) {
    return true;
  }
  return response.reason === 'needs-code';
}

/**
 * Page-realm SyncController (option B): no SyncEngine here — control ops relay to the background over
 * chrome.runtime messaging (timed out so a dead SW rejects); status hydrates from chrome.storage.local.
 */
export class BridgeSyncController implements SyncController {
  private status: SyncUiStatus = 'off';
  private readonly subscribers = new Set<(status: SyncUiStatus) => void>();
  private readonly toast?: (message: string) => void;
  private readonly timeoutMs: number;
  private readonly googleClientId?: string;

  constructor(opts: BridgeSyncControllerOptions = {}) {
    this.toast = opts.toast;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.googleClientId = opts.googleClientId;
    this.registerStorageListener();
    void this.hydrate();
  }

  getStatus(): SyncUiStatus {
    return this.status;
  }

  subscribe(cb: (status: SyncUiStatus) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  async enable(
    accountId: string,
    deviceName: string,
    recoveryCode?: string
  ): Promise<EnableResult> {
    let response: SyncControlResponse;
    try {
      response = await this.send({
        kind: 'cuewise-sync-control',
        op: 'enable',
        provider: 'dev',
        credential: accountId,
        deviceName,
        recoveryCode,
      });
    } catch (error) {
      logger.error('Sync enable control message failed', error);
      return { ok: false, reason: 'error' };
    }
    if (signedIn(response)) {
      // Persist inside a guard: a storage failure must not turn a sign-in into a rejection or
      // lose the one-shot recovery code — log and still return the response.
      try {
        await this.persistCreds({ provider: 'dev', accountId, deviceName });
      } catch (error) {
        logger.error('Failed to persist sync credentials for reconnect', error);
      }
    }
    return response;
  }

  // NEVER logs/persists the id token — it rides straight into the relayed message. Once signed in,
  // the provider (not the token) is persisted so reconnect can re-auth via Google.
  async enableWithGoogle(deviceName: string, recoveryCode?: string): Promise<EnableResult> {
    // Empty string is the "unset" value of the Vite env var (matches manifest.config.ts), so a
    // truthy check — not `=== undefined` — is what actually gates an unconfigured build.
    if (!this.googleClientId) {
      logger.error('enableWithGoogle called without a configured googleClientId');
      return { ok: false, reason: 'error', detail: 'Google sign-in is not configured' };
    }

    let granted: boolean;
    try {
      granted = await chrome.permissions.request({ permissions: ['identity'] });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to request the identity permission for Google sign-in: ${detail}`, {
        error,
      });
      return { ok: false, reason: 'auth' };
    }
    if (!granted) {
      logger.warn('Google sign-in aborted: the identity permission was denied');
      return { ok: false, reason: 'auth' };
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const nonce = crypto.randomUUID();
    const authUrl = `${GOOGLE_AUTH_ENDPOINT}?client_id=${encodeURIComponent(this.googleClientId)}&response_type=id_token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(GOOGLE_OAUTH_SCOPE)}&nonce=${encodeURIComponent(nonce)}&prompt=select_account`;

    let redirect: string | undefined;
    try {
      redirect = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
    } catch (error) {
      // Cancel, network failure, redirect-URI mismatch, and a bad client id all land here — log
      // the message + the Error object (no token exists yet). Deliberately NOT mapped to a quiet
      // detail:'cancelled': Chromium reports ANY auth-window close as its user-cancel message,
      // including the user closing a Google-side ERROR page (misconfig) — going quiet on that
      // would silence real failures. Only macOS's server-sanitized access_denied is trustworthy.
      const detail = error instanceof Error ? error.message : String(error);
      logger.warn(`Google sign-in auth flow was cancelled or failed: ${detail}`, { error });
      return { ok: false, reason: 'auth' };
    }
    if (redirect === undefined) {
      logger.warn('Google sign-in returned no redirect URL');
      return { ok: false, reason: 'auth' };
    }

    let idToken: string | null;
    try {
      idToken = new URLSearchParams(new URL(redirect).hash.slice(1)).get('id_token');
    } catch (error) {
      // Keep enableWithGoogle from ever throwing (reconnect() relays through it) — a malformed
      // redirect URL is an auth failure, not a control-message failure.
      const detail = error instanceof Error ? error.message : String(error);
      logger.warn(`Google sign-in redirect URL could not be parsed: ${detail}`, { error });
      return { ok: false, reason: 'auth' };
    }
    if (idToken === null) {
      logger.warn('Google sign-in redirect carried no id_token');
      return { ok: false, reason: 'auth' };
    }

    let response: SyncControlResponse;
    try {
      response = await this.send({
        kind: 'cuewise-sync-control',
        op: 'enable',
        provider: 'google',
        credential: idToken,
        deviceName,
        recoveryCode,
      });
    } catch (error) {
      logger.error('Sync enableWithGoogle control message failed', error);
      return { ok: false, reason: 'error' };
    }
    if (signedIn(response)) {
      // Persist the provider (never the id token) so reconnect knows to re-auth via Google.
      try {
        await this.persistCreds({ provider: 'google', deviceName });
      } catch (error) {
        logger.error('Failed to persist sync credentials for reconnect', error);
      }
    }
    return response;
  }

  canEnableWithGoogle(): boolean {
    return Boolean(this.googleClientId);
  }

  async reconnect(deviceName: string, recoveryCode?: string): Promise<EnableResult> {
    try {
      const stored = await chrome.storage.local.get(LAST_SYNC_CREDS_KEY);
      // Read loosely: storage is untyped, and records written before `provider` existed lack it.
      const creds = stored[LAST_SYNC_CREDS_KEY] as
        | { provider?: SyncSignInProvider; accountId?: string; deviceName?: string }
        | undefined;
      if (creds?.deviceName === undefined) {
        if (this.canEnableWithGoogle()) {
          logger.info('Cloud sync reconnect has no saved sign-in; signing in with Google');
          return await this.enableWithGoogle(deviceName, recoveryCode);
        }
        logger.warn('Cloud sync reconnect has no saved sign-in to replay');
        return { ok: false, reason: 'error', detail: NO_SAVED_SIGN_IN_DETAIL };
      }
      if (creds.provider === 'google') {
        // Google can't silently re-auth, so re-run OAuth. A device still without its data key
        // answers needs-code again, and a supplied code enrolls it.
        return await this.enableWithGoogle(creds.deviceName, recoveryCode);
      }
      // provider 'dev' or absent (a pre-`provider` record): silent re-auth needs the stored id.
      if (creds.accountId === undefined) {
        logger.warn('Cloud sync reconnect: dev credentials are missing an account id');
        return { ok: false, reason: 'error' };
      }
      // No code = silent re-auth via the persisted DK (E2); a code enrolls this device after reconnect.
      return await this.send({
        kind: 'cuewise-sync-control',
        op: 'reconnect',
        accountId: creds.accountId,
        deviceName: creds.deviceName,
        recoveryCode,
      });
    } catch (error) {
      logger.error('Sync reconnect control message failed', error);
      return { ok: false, reason: 'error' };
    }
  }

  async disable(): Promise<void> {
    const response = await this.send({ kind: 'cuewise-sync-control', op: 'disable' });
    if (!response.ok) {
      throw new Error(response.reason);
    }
  }

  async regenerateRecoveryCode(): Promise<string> {
    const response = await this.send({ kind: 'cuewise-sync-control', op: 'regenerate' });
    if (!response.ok) {
      throw new Error(`Failed to regenerate recovery code: ${response.reason}`);
    }
    if (response.recoveryCode === undefined) {
      throw new Error('Regenerate response missing a recovery code');
    }
    return response.recoveryCode;
  }

  // No transient 'syncing' emission: the SW's onStatus trampoline never emits it either,
  // so adding one here would be a page-only flicker the background can't corroborate. Two
  // guards, not one: an ok:false response (a non-conforming engine's op-level throw) and an
  // ok:true response with no outcome (a skewed SW) are different failures, both rejections.
  async syncNow(): Promise<SyncNowResult> {
    const response = await this.send({ kind: 'cuewise-sync-control', op: 'syncNow' });
    // `response?.ok` like every sibling: a dead worker resolves undefined, where a bare `.ok`
    // throws a TypeError naming nothing. The SW hardcodes reason:'error' for this op, so `detail`
    // is the only field naming the cause — carry it or the message says nothing every time.
    if (!response?.ok) {
      const reason = response?.reason ?? 'no response from the background';
      const detail = response?.detail;
      throw new Error(
        detail === undefined
          ? `Sync now failed: ${reason}`
          : `Sync now failed: ${reason} — ${detail}`
      );
    }
    if (response.kind !== 'outcome') {
      throw new Error('Sync now response missing an outcome');
    }
    return response.outcome;
  }

  /** The type, plus the value when it is a short string: a status is a vocabulary, not user data. */
  private static describeStatus(value: unknown): string {
    if (typeof value !== 'string') {
      return typeof value;
    }
    return value.length <= 40 ? value : `${value.slice(0, 40)}…`;
  }

  private setStatus(status: SyncUiStatus): void {
    this.status = status;
    for (const subscriber of this.subscribers) {
      subscriber(status);
    }
  }

  private async hydrate(): Promise<void> {
    let stored: Record<string, unknown>;
    try {
      stored = await chrome.storage.local.get([STATUS_KEY, CLOUD_SYNC_ENABLED_KEY]);
    } catch (error) {
      logger.error('Failed to hydrate sync status', error);
      this.setStatus('off');
      return;
    }
    const persistedStatus = asSyncUiStatus(stored[STATUS_KEY]);
    if (persistedStatus !== null) {
      this.setStatus(persistedStatus);
      return;
    }
    if (stored[STATUS_KEY] !== undefined) {
      logger.error(
        `Ignoring an unrecognised persisted sync status: ${BridgeSyncController.describeStatus(stored[STATUS_KEY])}`
      );
    }
    // Unrecognised reconciles the same way absent does, and deliberately not as 'error': a worker
    // writing a status this page has not learned yet is a healthy install, not a failed enable.
    if (stored[CLOUD_SYNC_ENABLED_KEY] === true) {
      // Enabled but the SW died before writing a status — reconcile to active rather
      // than showing 'off' and implying sync is disabled.
      this.setStatus('active');
      return;
    }
    this.setStatus('off');
  }

  private registerStorageListener(): void {
    chrome.storage.onChanged.addListener(
      (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
        if (area !== 'local') {
          return;
        }
        const statusChange = changes[STATUS_KEY];
        if (statusChange !== undefined) {
          const raw = statusChange.newValue;
          if (raw !== undefined) {
            // An unrecognised status is not information — keep the last one this page understood
            // rather than letting it through to render a blank panel body.
            const newStatus = asSyncUiStatus(raw);
            if (newStatus === null) {
              logger.error(
                `Ignoring an unrecognised sync status change: ${BridgeSyncController.describeStatus(raw)}`
              );
            } else {
              this.setStatus(newStatus);
            }
          }
        }
        const quarantineChange = changes[QUARANTINE_KEY];
        if (
          quarantineChange !== undefined &&
          quarantineChange.newValue !== undefined &&
          this.toast !== undefined
        ) {
          this.toast("A synced item couldn't be read and was skipped");
        }
      }
    );
  }

  // Warn, not error: the UI only hides one line, and a reload heals a version-skewed worker.
  async getDetails(options?: SyncDetailsOptions): Promise<SyncDetails | null> {
    return this.callOrFallback(
      {
        kind: 'cuewise-sync-control',
        op: 'details',
        refreshRecoveryEnvelope: options?.refreshRecoveryEnvelope,
      },
      'details',
      (response) => response.details,
      null,
      BridgeSyncController.warnLog('Sync details')
    );
  }

  async listSessions(): Promise<SyncSession[] | null> {
    return this.callOrFallback(
      { kind: 'cuewise-sync-control', op: 'listSessions' },
      'sessions',
      (response) => response.sessions,
      null,
      BridgeSyncController.warnLog('Sync session list')
    );
  }

  /**
   * Names the cause of a failed action. The SW hardcodes reason:'error' for these ops, so `detail`
   * is the only field naming what actually went wrong — carry it, as syncNow does.
   */
  private static describeActionFailure(
    response: Extract<SyncControlResponse, { ok: false }> | undefined | null
  ): string {
    // Null as well as undefined, like describeUnavailableCause: the wire is untyped, and reading
    // `.detail` off a null answer would replace this diagnostic with the throw it reports.
    if (response === undefined || response === null) {
      return 'no response from the background';
    }
    const detail = response.detail === undefined ? '' : ` — ${response.detail}`;
    return `${response.reason}${detail}`;
  }

  // Actions reject, unlike listSessions. chrome.runtime JSON-serialises the response, so the SW
  // answers {ok:false} rather than throwing; turning it back into a rejection here is what makes
  // the panel's try/catch behave the same on both hosts.
  async revokeSession(id: string): Promise<void> {
    const response = await this.send({
      kind: 'cuewise-sync-control',
      op: 'revokeSession',
      sessionId: id,
    });
    if (!response?.ok) {
      throw new Error(
        `Failed to revoke session: ${BridgeSyncController.describeActionFailure(response)}`
      );
    }
  }

  async renameSession(id: string, deviceName: string): Promise<void> {
    const response = await this.send({
      kind: 'cuewise-sync-control',
      op: 'renameSession',
      sessionId: id,
      deviceName,
    });
    if (!response?.ok) {
      throw new Error(
        `Failed to rename session: ${BridgeSyncController.describeActionFailure(response)}`
      );
    }
  }

  async revokeOtherSessions(): Promise<number> {
    const response = await this.send({
      kind: 'cuewise-sync-control',
      op: 'revokeOtherSessions',
    });
    if (response?.ok !== true) {
      throw new Error(
        `Failed to sign out other devices: ${BridgeSyncController.describeActionFailure(response)}`
      );
    }
    // A skewed SW can answer ok:true with no count, or a wrong body can make it non-numeric;
    // either way that is unusable, not a success worth toasting.
    if (response.kind !== 'revokedCount' || typeof response.revoked !== 'number') {
      throw new Error('Failed to sign out other devices: response carried no usable count');
    }
    return response.revoked;
  }

  // A timeout answers error, but the worker may still finish the delete; its teardown then turns
  // the panel off.
  async deleteAccount(): Promise<DeleteAccountResult> {
    try {
      const response = await this.send(
        { kind: 'cuewise-sync-control', op: 'deleteAccount' },
        this.timeoutMs * DELETE_ACCOUNT_TIMEOUT_FACTOR
      );
      if (response?.ok === true) {
        return { ok: true };
      }
      if (response?.ok === false && response.reason === 'auth') {
        return { ok: false, reason: 'auth' };
      }
      logger.error(
        `Cloud sync account delete failed: ${BridgeSyncController.describeActionFailure(
          response?.ok === false ? response : undefined
        )}`
      );
      return { ok: false, reason: 'error' };
    } catch (error) {
      logger.error(`Cloud sync account delete failed: ${describeThrown(error)}`, error);
      return { ok: false, reason: 'error' };
    }
  }

  /** Names which of the three unavailable causes this was; `reason` is present on every ok:false. */
  private static describeUnavailableCause(
    response: SyncOpResponse['getLastCycle'] | undefined
  ): string {
    // Null as well as undefined: the wire is untyped, and reading `.ok` off a null answer would
    // turn this diagnostic into the throw the outer catch then reports instead of the cause.
    if (response === undefined || response === null) {
      return 'no response from the background';
    }
    if (response.ok === false) {
      const detail = response.detail === undefined ? '' : ` — ${response.detail}`;
      return `the background reported ${response.reason}${detail}`;
    }
    return 'a response carrying no lastCycle payload';
  }

  // Every unreadable path answers LAST_CYCLE_UNAVAILABLE, never a null outcome: a dead worker, a
  // timeout and a skewed response say nothing about the cycle, so the panel must keep its badge.
  async getLastCycle(): Promise<LastCycleRead> {
    // Error, not warn: the shipped logLevel is 'error', and a cycle that never reads is otherwise
    // invisible. The cause separates a silent worker from one reporting an unreadable record.
    return this.callOrFallback(
      { kind: 'cuewise-sync-control', op: 'getLastCycle' },
      'lastCycle',
      (response): LastCycleRead => ({ available: true, outcome: response.outcome }),
      LAST_CYCLE_UNAVAILABLE,
      {
        unavailable: (response) => {
          logger.error(
            `Sync last-cycle outcome unavailable: ${BridgeSyncController.describeUnavailableCause(response)}`
          );
        },
        failed: (error) => {
          logger.error(`Sync last-cycle control message failed: ${describeThrown(error)}`, error);
        },
      }
    );
  }

  // Pairing ops answer rather than throw: a dead worker or skewed response reads as "cannot pair
  // right now" (or a non-terminal poll `error` that retries next tick), never a rejection.
  async beginPairing(): Promise<{ pairingId: string } | null> {
    return this.callOrFallback(
      { kind: 'cuewise-sync-control', op: 'beginPairing' },
      'pairingStarted',
      (response) => response.pairing,
      null,
      BridgeSyncController.pairingLog('request')
    );
  }

  async pollPairing(): Promise<PairingPollResult> {
    return this.callOrFallback(
      { kind: 'cuewise-sync-control', op: 'pollPairing' },
      'pairingPoll',
      (response) => response.result,
      { kind: 'error' },
      BridgeSyncController.pairingLog('poll')
    );
  }

  async listPairingRequests(): Promise<PendingPairing[]> {
    return this.callOrFallback(
      { kind: 'cuewise-sync-control', op: 'listPairingRequests' },
      'pairingRequests',
      (response) => response.requests,
      [],
      BridgeSyncController.pairingLog('requests')
    );
  }

  async commitPairing(id: string): Promise<{ pending: true } | null> {
    return this.callOrFallback(
      { kind: 'cuewise-sync-control', op: 'commitPairing', pairingRequestId: id },
      'pairingCommit',
      (response) => response.result,
      null,
      BridgeSyncController.pairingLog('commit')
    );
  }

  async pollApproval(id: string, row?: PendingPairing): Promise<PairingApprovalResult> {
    return this.callOrFallback(
      {
        kind: 'cuewise-sync-control',
        op: 'pollApproval',
        pairingRequestId: id,
        // The row the list poll already fetched, so the worker doesn't re-list the whole account.
        pairingRow: row,
      },
      'pairingApproval',
      (response) => response.result,
      { kind: 'error' },
      BridgeSyncController.pairingLog('approval poll')
    );
  }

  async approvePairing(id: string): Promise<boolean> {
    return this.callOrFallback(
      { kind: 'cuewise-sync-control', op: 'approvePairing', pairingRequestId: id },
      'pairingApprove',
      (response) => response.approved,
      false,
      BridgeSyncController.pairingLog('approve')
    );
  }

  async denyPairing(id: string): Promise<void> {
    return this.callOrFallback(
      { kind: 'cuewise-sync-control', op: 'denyPairing', pairingRequestId: id },
      null,
      () => undefined,
      undefined,
      BridgeSyncController.pairingLog('deny')
    );
  }

  private static warnLog(subject: string): FallbackLog<SyncControlOp> {
    return {
      unavailable: () => {
        logger.warn(`${subject} unavailable (no responder or error fallback)`);
      },
      failed: (error) => {
        logger.warn(`${subject} control message failed: ${describeThrown(error)}`);
      },
    };
  }

  private static pairingLog(action: string): FallbackLog<SyncControlOp> {
    return {
      unavailable: (response) => {
        logger.error(
          `Cloud sync pairing ${action} unavailable: ${BridgeSyncController.describeActionFailure(
            response?.ok === false ? response : undefined
          )}`
        );
      },
      failed: (error) => {
        logger.error(`Cloud sync pairing ${action} failed: ${describeThrown(error)}`, error);
      },
    };
  }

  // The wire is untyped: a skewed worker answers undefined, {ok:false}, or {ok:true} without the
  // expected kind tag, and every one of those reads as the fallback, never a rejection.
  private async callOrFallback<O extends SyncControlOp, T>(
    msg: SyncControlMessage & { op: O },
    kind: OkKind<O>,
    read: (response: OkResponse<O>) => T,
    fallback: T,
    log: FallbackLog<O>
  ): Promise<T> {
    try {
      const response: SyncOpResponse[O] | undefined = await this.send(msg);
      if (response?.ok && (kind === null || (response as { kind?: unknown }).kind === kind)) {
        return read(response as OkResponse<O>);
      }
      log.unavailable(response);
      return fallback;
    } catch (error) {
      log.failed(error);
      return fallback;
    }
  }

  private async persistCreds(creds: LastSyncCreds): Promise<void> {
    await chrome.storage.local.set({ [LAST_SYNC_CREDS_KEY]: creds });
  }

  // Races the control response against timeoutMs so a dead/asleep SW rejects instead of
  // hanging the UI forever; clears the timer on either settling path. The wire is untyped —
  // the mapped type only ties the assumed response shape to the op actually being sent, so a
  // caller can't silently read a details response as an EnableResult (or vice versa).
  private send<O extends SyncControlOp>(
    msg: SyncControlMessage & { op: O },
    timeoutMs: number = this.timeoutMs
  ): Promise<SyncOpResponse[O]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Sync control message timed out'));
      }, timeoutMs);
    });

    let response: Promise<SyncOpResponse[O]>;
    try {
      response = Promise.resolve(chrome.runtime.sendMessage(msg)) as Promise<SyncOpResponse[O]>;
    } catch (error) {
      response = Promise.reject(error);
    }

    return Promise.race([response, timeout]).finally(() => {
      clearTimeout(timer);
    });
  }
}
