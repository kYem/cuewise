import type { EnableResult, SyncController, SyncUiStatus } from '@cuewise/app';
import { logger } from '@cuewise/shared';
import { CLOUD_SYNC_ENABLED_KEY, type SyncSignInProvider } from '@cuewise/sync-engine';
import type { SyncControlMessage, SyncControlResponse } from './sync-control-messages';
import { LAST_SYNC_CREDS_KEY, QUARANTINE_KEY, STATUS_KEY } from './sync-storage-keys';

const DEFAULT_TIMEOUT_MS = 30000;

// Google OAuth 2.0 authorization endpoint + the OpenID scope for the implicit id_token flow.
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_SCOPE = 'openid email';

interface LastSyncCreds {
  provider: SyncSignInProvider;
  // Only the dev provider stores a reusable credential; Google re-auths via a fresh OAuth flow.
  accountId?: string;
  deviceName: string;
}

export interface BridgeSyncControllerOptions {
  /** Fires on quarantine (never the recovery code/credential/token — those are secrets). */
  toast?: (message: string) => void;
  timeoutMs?: number;
  /** OAuth client id for chrome.identity.launchWebAuthFlow; unset disables enableWithGoogle. */
  googleClientId?: string;
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
    if (response.ok) {
      // Persist inside a guard: a storage failure must not turn a successful enroll into a
      // rejection or lose the one-shot recovery code — log and still return the ok response.
      try {
        await this.persistCreds({ provider: 'dev', accountId, deviceName });
      } catch (error) {
        logger.error('Failed to persist sync credentials for reconnect', error);
      }
    }
    return response;
  }

  // NEVER logs/persists the id token — it rides straight into the relayed message. On success the
  // provider (not the token) is persisted so reconnect can re-auth via Google.
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
      logger.warn(`Failed to request the identity permission for Google sign-in: ${detail}`);
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
      // Cancel, network failure, redirect-URI mismatch, and a bad client id all land here — log the
      // real error (no token exists yet) so a misconfig isn't indistinguishable from a user cancel.
      const detail = error instanceof Error ? error.message : String(error);
      logger.warn(`Google sign-in auth flow was cancelled or failed: ${detail}`);
      return { ok: false, reason: 'auth' };
    }
    if (redirect === undefined) {
      logger.warn('Google sign-in returned no redirect URL');
      return { ok: false, reason: 'auth' };
    }

    const idToken = new URLSearchParams(new URL(redirect).hash.slice(1)).get('id_token');
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
    if (response.ok) {
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

  async reconnect(recoveryCode?: string): Promise<EnableResult> {
    try {
      const stored = await chrome.storage.local.get(LAST_SYNC_CREDS_KEY);
      const creds = stored[LAST_SYNC_CREDS_KEY] as LastSyncCreds | undefined;
      if (creds === undefined) {
        logger.warn('Cloud sync reconnect has no persisted credentials');
        return { ok: false, reason: 'error' };
      }
      if (creds.provider === 'google') {
        // Google can't silently re-auth — re-run the OAuth flow. The data key is already on this
        // device, so no code is needed; a supplied code re-enrolls after reconnect.
        return await this.enableWithGoogle(creds.deviceName, recoveryCode);
      }
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
  // so adding one here would be a page-only flicker the background can't corroborate.
  async syncNow(): Promise<void> {
    const response = await this.send({ kind: 'cuewise-sync-control', op: 'syncNow' });
    if (!response.ok) {
      throw new Error(response.reason);
    }
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
    const persistedStatus = stored[STATUS_KEY] as SyncUiStatus | undefined;
    if (persistedStatus !== undefined) {
      this.setStatus(persistedStatus);
      return;
    }
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
          const newStatus = statusChange.newValue as SyncUiStatus | undefined;
          if (newStatus !== undefined) {
            this.setStatus(newStatus);
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

  private async persistCreds(creds: LastSyncCreds): Promise<void> {
    await chrome.storage.local.set({ [LAST_SYNC_CREDS_KEY]: creds });
  }

  // Races the control response against timeoutMs so a dead/asleep SW rejects instead of
  // hanging the UI forever; clears the timer on either settling path.
  private send(msg: SyncControlMessage): Promise<SyncControlResponse> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Sync control message timed out'));
      }, this.timeoutMs);
    });

    let response: Promise<SyncControlResponse>;
    try {
      response = Promise.resolve(chrome.runtime.sendMessage(msg)) as Promise<SyncControlResponse>;
    } catch (error) {
      response = Promise.reject(error);
    }

    return Promise.race([response, timeout]).finally(() => {
      clearTimeout(timer);
    });
  }
}
