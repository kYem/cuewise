import type { EnableResult, SyncController, SyncUiStatus } from '@cuewise/app';
import { logger } from '@cuewise/shared';
import { CLOUD_SYNC_ENABLED_KEY } from '@cuewise/sync-engine';
import type { SyncControlMessage, SyncControlResponse } from './sync-control-messages';

// Raw (unnamespaced) chrome.storage.local keys the background writes — see background.ts.
const STATUS_KEY = 'cuewise.sync.status';
const QUARANTINE_KEY = 'cuewise.sync.lastQuarantineAt';
/** Exported so tests can assert against it without duplicating the literal (mirrors macOS's DirectSyncController). */
export const LAST_SYNC_CREDS_KEY = 'cuewise.sync.lastCreds';

const DEFAULT_TIMEOUT_MS = 30000;

interface LastSyncCreds {
  accountId: string;
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
        await this.persistCreds({ accountId, deviceName });
      } catch (error) {
        logger.error('Failed to persist sync credentials for reconnect', error);
      }
    }
    return response;
  }

  // NEVER logs/persists the id token — it rides straight into the relayed message.
  // Reconnect-for-Google (persisting these creds) is a documented follow-up.
  async enableWithGoogle(deviceName: string, recoveryCode?: string): Promise<EnableResult> {
    if (this.googleClientId === undefined) {
      logger.error('enableWithGoogle called without a configured googleClientId');
      return { ok: false, reason: 'error', detail: 'Google sign-in is not configured' };
    }

    const granted = await chrome.permissions.request({ permissions: ['identity'] });
    if (!granted) {
      return { ok: false, reason: 'auth' };
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const nonce = crypto.randomUUID();
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(this.googleClientId)}&response_type=id_token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('openid email')}&nonce=${encodeURIComponent(nonce)}&prompt=select_account`;

    let redirect: string | undefined;
    try {
      redirect = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
    } catch {
      logger.warn('Google sign-in auth flow was cancelled or failed');
      return { ok: false, reason: 'auth' };
    }
    if (redirect === undefined) {
      return { ok: false, reason: 'auth' };
    }

    const idToken = new URLSearchParams(new URL(redirect).hash.slice(1)).get('id_token');
    if (idToken === null) {
      return { ok: false, reason: 'auth' };
    }

    try {
      return await this.send({
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
  }

  async reconnect(recoveryCode?: string): Promise<EnableResult> {
    try {
      const stored = await chrome.storage.local.get(LAST_SYNC_CREDS_KEY);
      const creds = stored[LAST_SYNC_CREDS_KEY] as LastSyncCreds | undefined;
      if (creds === undefined) {
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
