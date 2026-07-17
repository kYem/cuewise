import { logger } from '@cuewise/shared';
import { AlertTriangle, CloudUpload, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { useToastStore } from '../../stores/toast-store';
import type { EnableResult, SyncDetails, SyncUiStatus } from '../../sync/sync-controller';
import { AUTH_CANCELLED_DETAIL, useSyncController } from '../../sync/sync-controller';
import { formatTimeAgo } from '../../utils/reminder-date-utils';
import { ConfirmationDialog } from '../ConfirmationDialog';
import { EnrollCodeModal } from './EnrollCodeModal';
import { RecoveryCodeModal } from './RecoveryCodeModal';
import { SettingRow, SettingSubgroup, Switch } from './SettingControls';
import type { SettingsSection } from './SettingsSections';
import { settingsMatch } from './settings-match';
import type { SettingsSectionProps } from './settings-types';

const SEARCH_TERMS = 'cloud sync encrypted end-to-end recovery code account device backup';

/** The standard four-color "G" mark — kept local since lucide-react has no brand icons. */
const GoogleGlyph: React.FC = () => (
  <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9.001 9.001 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
    />
  </svg>
);

// Only the "on" statuses get a pill; off/needs_reauth/error render their own dedicated UI below.
const STATUS_PILL_LABEL: Partial<Record<SyncUiStatus, string>> = {
  connecting: 'Connecting…',
  syncing: 'Syncing…',
  active: 'Active',
};

const DISABLE_MESSAGE = 'Re-enabling on this device will need your recovery code.';
const DISABLE_MESSAGE_UNSAVED =
  "You haven't saved your recovery code yet — regenerate and save one first, or you may lose access when you re-enable this device.";

// Short device label from the UA string; falls back when nothing recognizable matches.
function deriveDeviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  const patterns: [RegExp, string][] = [
    [/iPad/i, 'iPad'],
    [/iPhone/i, 'iPhone'],
    [/Android/i, 'Android device'],
    [/Macintosh/i, 'Mac'],
    [/Windows/i, 'Windows PC'],
    [/Linux/i, 'Linux device'],
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(ua)) {
      return label;
    }
  }
  return 'This device';
}

function enableFailureMessage(result: Extract<EnableResult, { ok: false }>): string {
  if (result.reason === 'bad-code') {
    return "That recovery code didn't work — please check it and try again.";
  }
  if (result.reason === 'auth') {
    return "Couldn't verify your account — please try again.";
  }
  return 'Something went wrong enabling sync — please try again.';
}

function pillClass(status: SyncUiStatus): string {
  if (status === 'active') {
    return 'inline-flex w-fit items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success';
  }
  return 'inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-variant px-2.5 py-1 text-xs font-medium text-secondary';
}

// Cloud Sync and legacy Chrome sync must never both replicate the same data, so activating Cloud
// Sync hands off from Chrome sync: turn it off, migrating any chrome.storage.sync data back to
// local. Called only AFTER a sign-in succeeds, so a cancelled/failed attempt leaves Chrome sync
// untouched; the engine keeps its metadata in local regardless, so this post-success migration is
// consistent. A no-op when Chrome sync is already off (the default, and on local-only hosts).
async function takeOverFromChromeSync(): Promise<void> {
  const store = useSettingsStore.getState();
  if (store.settings.syncEnabled) {
    await store.updateSettings({ syncEnabled: false });
  }
}

export const SyncSettingsSectionComponent: React.FC<SettingsSectionProps> = ({ filter }) => {
  const controller = useSyncController();
  const [status, setStatus] = useState<SyncUiStatus>(() => controller?.getStatus() ?? 'off');
  const [enabling, setEnabling] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [deviceName, setDeviceName] = useState(deriveDeviceName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  // Which flow opened EnrollCodeModal — reconnect reuses persisted creds; enable/google re-run
  // that same sign-in with the entered code (google re-auths for a fresh id token).
  const [enrollSource, setEnrollSource] = useState<'enable' | 'google' | 'reconnect'>('enable');
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [unsavedCode, setUnsavedCode] = useState(false);
  // The error state's "Try again" retries the exact action that failed (enable / google /
  // reconnect) — syncNow can't recover it and would falsely report success.
  const [failedAction, setFailedAction] = useState<'enable' | 'google' | 'reconnect'>('enable');
  // The macOS google flow can take minutes; if Settings closes meanwhile, a late recovery code
  // has no modal to render into — the ref routes it to a global toast instead of vanishing.
  const mountedRef = useRef(true);
  // "Signed in as … · Last synced …" — fetched once per mount when sync is first seen running.
  const [details, setDetails] = useState<SyncDetails | null>(null);
  const detailsRequestedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!controller || detailsRequestedRef.current) {
      return;
    }
    if (status !== 'active' && status !== 'syncing') {
      return;
    }
    detailsRequestedRef.current = true;
    controller.getDetails().then(
      (result) => {
        if (result === null) {
          // Transient miss (e.g. the fetch queued behind a long initial sync and timed out) —
          // re-arm so the next status transition retries instead of blanking the whole mount.
          detailsRequestedRef.current = false;
          return;
        }
        setDetails(result);
      },
      (error) => {
        // Purely informational — render today's UI rather than surfacing anything.
        logger.warn(
          `Cloud sync details unavailable: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    );
  }, [controller, status]);

  useEffect(() => {
    if (!controller) {
      return undefined;
    }
    setStatus(controller.getStatus());
    return controller.subscribe(setStatus);
  }, [controller]);

  if (!controller) {
    return null;
  }
  if (!settingsMatch(filter, SEARCH_TERMS)) {
    return null;
  }

  // A show-once recovery code must never vanish: if Settings closed during a slow OAuth flow,
  // the modal has no mount — tell the user (globally) to regenerate one instead. Recoverable:
  // the code grants nothing by itself and Regenerate mints a fresh one.
  const surfaceRecoveryCode = (code: string) => {
    if (mountedRef.current) {
      setRecoveryCode(code);
      return;
    }
    logger.error('Cloud sync enabled after Settings closed — the recovery code had no surface');
    useToastStore
      .getState()
      .warning('Cloud sync is on — open Settings → Cloud Sync and regenerate your recovery code.');
  };

  // Shared by the initial enable() and the reconnect() flows — both surface the same shape.
  // source records which flow needs a code, so the EnrollCodeModal submit routes back correctly.
  const routeEnableResult = async (
    result: EnableResult,
    source: 'enable' | 'google' | 'reconnect'
  ) => {
    if (result.ok) {
      // Cloud Sync is now active — hand off from legacy Chrome sync (see takeOverFromChromeSync).
      await takeOverFromChromeSync();
      setEnabling(false);
      if (result.recoveryCode) {
        surfaceRecoveryCode(result.recoveryCode);
      }
      return;
    }
    if (result.reason === 'needs-code') {
      // Device #2 of an existing account: EnrollCodeModal collects the recovery code and re-runs
      // this same sign-in method with it. A brand-new account (device #1) never needs a code.
      setEnrollSource(source);
      setEnrollOpen(true);
      return;
    }
    if (result.reason === 'auth' && result.detail === AUTH_CANCELLED_DETAIL) {
      // A deliberate user cancel (closing Google's consent screen) isn't a failure — no error
      // state, no toast; the form stays open for another attempt.
      logger.info(`Cloud sync ${source} sign-in was cancelled by the user`);
      return;
    }
    setFailedAction(source);
    // Log the cause as a string, not an object arg: string-coercing surfaces (Chrome's extension
    // Errors panel, log aggregators) render an object as "[object Object]".
    logger.error(
      `Cloud sync ${source} failed — reason=${result.reason}, detail=${result.detail ?? 'none'}`
    );
    useToastStore.getState().error(enableFailureMessage(result));
  };

  const handleEnable = async () => {
    setIsSubmitting(true);
    try {
      const result = await controller.enable(accountId, deviceName);
      await routeEnableResult(result, 'enable');
    } catch (error) {
      logger.error('Cloud sync enable failed', error);
      useToastStore.getState().error('Something went wrong enabling sync — please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleSigningIn(true);
    try {
      const result = await controller.enableWithGoogle(deviceName);
      await routeEnableResult(result, 'google');
    } catch (error) {
      logger.error('Google sign-in for cloud sync failed', error);
      useToastStore.getState().error('Something went wrong enabling sync — please try again.');
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      const result = await controller.reconnect();
      await routeEnableResult(result, 'reconnect');
    } catch (error) {
      logger.error('Cloud sync reconnect failed', error);
      useToastStore.getState().error("Couldn't reconnect sync — please try again.");
    } finally {
      setIsReconnecting(false);
    }
  };

  // Reconnect-after-needs-code reuses the persisted creds; a brand-new enable uses the form inputs.
  // Never rejects — messageFor can render a specific message instead of an unhandled rejection.
  const handleEnrollSubmit = async (code: string): Promise<EnableResult> => {
    let result: EnableResult;
    try {
      if (enrollSource === 'reconnect') {
        result = await controller.reconnect(code);
      } else if (enrollSource === 'google') {
        result = await controller.enableWithGoogle(deviceName, code);
      } else {
        result = await controller.enable(accountId, deviceName, code);
      }
    } catch (error) {
      logger.error('Enroll submit failed', error);
      return { ok: false, reason: 'error' };
    }
    if (result.ok) {
      // Enrolled successfully — hand off from Chrome sync (see takeOverFromChromeSync).
      await takeOverFromChromeSync();
      setEnabling(false);
      if (result.recoveryCode) {
        surfaceRecoveryCode(result.recoveryCode);
      }
    } else if (result.reason === 'auth' && result.detail === AUTH_CANCELLED_DETAIL) {
      logger.info('Cloud sync enroll re-auth was cancelled by the user');
    } else {
      // The modal renders the message; this is the default-visible trace of what failed.
      logger.error(
        `Cloud sync enroll failed — reason=${result.reason}, detail=${result.detail ?? 'none'}`
      );
    }
    return result;
  };

  const handleRegenerate = async () => {
    try {
      const code = await controller.regenerateRecoveryCode();
      setUnsavedCode(false);
      setRecoveryCode(code);
    } catch (error) {
      logger.error('Cloud sync regenerate recovery code failed', error);
      useToastStore.getState().error("Couldn't regenerate your recovery code — please try again.");
    }
  };

  const handleSyncNow = async () => {
    try {
      await controller.syncNow();
      useToastStore.getState().success('Synced');
    } catch (error) {
      logger.error('Cloud sync sync-now failed', error);
      useToastStore.getState().error("Couldn't sync right now — please try again.");
    }
    // Refresh "Last synced" OUTSIDE the try — the sync-now error surface belongs to syncNow
    // alone (the catch keeps even a contract-violating host from rejecting the click handler).
    // Keep the last known details on a transient null: a stale line beats a vanishing one.
    const next = await controller.getDetails().catch(() => null);
    if (next !== null) {
      setDetails(next);
    }
  };

  // Retry the exact action that failed. A dev-enable retry needs the form's account id; without it
  // (e.g. the UI mounted straight into a persisted error after a reload) fall back to reconnect,
  // which recovers from persisted creds. Google carries no account id, so it retries directly.
  const handleRetry = async () => {
    if (failedAction === 'google') {
      await handleGoogleSignIn();
      return;
    }
    if (failedAction === 'reconnect' || accountId.trim().length === 0) {
      await handleReconnect();
      return;
    }
    await handleEnable();
  };

  const handleToggle = (checked: boolean) => {
    if (status === 'off') {
      setEnabling(checked);
      return;
    }
    if (!checked) {
      setConfirmDisableOpen(true);
    }
  };

  // finally closes the confirm dialog so a disable failure can't strand it open.
  const handleDisable = async () => {
    setIsDisabling(true);
    try {
      await controller.disable();
      setEnabling(false);
      // A re-enable in this same mount may be a DIFFERENT account — drop the shown identity
      // and re-arm the once-per-mount fetch so it can't display the previous owner's details.
      setDetails(null);
      detailsRequestedRef.current = false;
    } catch (error) {
      logger.error('Cloud sync disable failed', error);
      useToastStore.getState().error("Couldn't disable sync — please try again.");
    } finally {
      setConfirmDisableOpen(false);
      setIsDisabling(false);
    }
  };

  const handleRecoverySaved = () => {
    setRecoveryCode(null);
    setUnsavedCode(false);
  };

  const handleRecoveryCancelUnsaved = () => {
    setRecoveryCode(null);
    setUnsavedCode(true);
  };

  const switchChecked = status === 'off' ? enabling : true;
  const pillLabel = STATUS_PILL_LABEL[status];

  // The enable step's sign-in-options div groups Google today; a "Sign in with Apple"
  // button drops in next to it later.
  return (
    <div>
      <SettingRow
        label="Cloud Sync — end-to-end encrypted"
        help="Encrypted on this device before it leaves — we can't read your data."
        filter={filter}
        keywords={SEARCH_TERMS}
      >
        <Switch
          id="cloud-sync-switch"
          label="Cloud Sync"
          checked={switchChecked}
          onChange={handleToggle}
        />
      </SettingRow>

      {unsavedCode && (
        <div
          data-testid="unsaved-code-banner"
          className="my-1.5 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
        >
          <AlertTriangle className="h-3.5 w-3.5 flex-none" />
          recovery code not saved — Regenerate to get a new one
        </div>
      )}

      {status === 'off' && enabling && (
        <SettingSubgroup>
          <div className="flex flex-col gap-3 py-2">
            <div className="space-y-1.5">
              <label htmlFor="sync-device-name" className="block text-sm font-medium text-primary">
                Device name
              </label>
              <input
                id="sync-device-name"
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {controller.canEnableWithGoogle() && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleSigningIn}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGoogleSigningIn ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleGlyph />
                  )}
                  {isGoogleSigningIn ? 'Signing in…' : 'Sign in with Google'}
                </button>
              </div>
            )}

            {import.meta.env.DEV && (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <p className="text-xs font-medium text-tertiary">
                  Dev only — sign in by account ID
                </p>
                <div className="space-y-1.5">
                  <label
                    htmlFor="sync-account-id"
                    className="block text-sm font-medium text-primary"
                  >
                    Account ID
                  </label>
                  <input
                    id="sync-account-id"
                    type="text"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleEnable}
                  disabled={isSubmitting || accountId.trim().length === 0}
                  className="flex w-fit items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Enabling…' : 'Enable'}
                </button>
              </div>
            )}
          </div>
        </SettingSubgroup>
      )}

      {pillLabel && (
        <SettingSubgroup>
          <div className="flex flex-col gap-3 py-2">
            <span data-testid="sync-status-pill" className={pillClass(status)}>
              {pillLabel}
            </span>
            {details && (
              <div data-testid="sync-account-label" className="text-xs text-tertiary">
                {details.accountEmail !== null
                  ? `Signed in as ${details.accountEmail}`
                  : `Account: ${details.accountId.slice(0, 8)}…`}
              </div>
            )}
            <div data-testid="sync-device-label" className="text-xs text-tertiary">
              Device: {deviceName}
              {details !== null && details.lastSyncedAt !== null
                ? ` · Last synced ${formatTimeAgo(details.lastSyncedAt)}`
                : ''}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSyncNow}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-variant"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync now
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-variant"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Regenerate recovery code
              </button>
            </div>
          </div>
        </SettingSubgroup>
      )}

      {status === 'needs_reauth' && (
        <SettingSubgroup>
          <div className="flex flex-col gap-2 py-2">
            <p className="text-xs text-tertiary">Sign-in expired — reconnect to keep syncing.</p>
            <button
              type="button"
              onClick={handleReconnect}
              disabled={isReconnecting}
              className="flex w-fit items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isReconnecting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isReconnecting ? 'Reconnecting…' : 'Reconnect'}
            </button>
          </div>
        </SettingSubgroup>
      )}

      {status === 'error' && (
        <SettingSubgroup>
          <div className="flex flex-col gap-2 py-2">
            <p className="text-xs text-error">Couldn't turn on Cloud Sync — please try again.</p>
            <button
              type="button"
              onClick={handleRetry}
              className="flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-variant"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        </SettingSubgroup>
      )}

      <ConfirmationDialog
        isOpen={confirmDisableOpen}
        onClose={() => setConfirmDisableOpen(false)}
        onConfirm={handleDisable}
        title="Disable Cloud Sync?"
        message={unsavedCode ? DISABLE_MESSAGE_UNSAVED : DISABLE_MESSAGE}
        confirmText="Disable"
        variant="warning"
        isLoading={isDisabling}
      />

      <RecoveryCodeModal
        isOpen={recoveryCode !== null}
        code={recoveryCode ?? ''}
        onSaved={handleRecoverySaved}
        onCancelUnsaved={handleRecoveryCancelUnsaved}
      />

      <EnrollCodeModal
        isOpen={enrollOpen}
        onSubmit={handleEnrollSubmit}
        onClose={() => setEnrollOpen(false)}
      />
    </div>
  );
};

export const syncSettingsSection: SettingsSection = {
  id: 'cloud-sync',
  label: 'Cloud Sync',
  icon: CloudUpload,
  component: SyncSettingsSectionComponent,
  terms: SEARCH_TERMS,
};
