import { logger } from '@cuewise/shared';
import { AlertTriangle, CloudUpload, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useToastStore } from '../../stores/toast-store';
import type { EnableResult, SyncUiStatus } from '../../sync/sync-controller';
import { useSyncController } from '../../sync/sync-controller';
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
  // Which flow opened EnrollCodeModal — reconnect reuses persisted creds, enable uses form inputs.
  const [enrollSource, setEnrollSource] = useState<'enable' | 'reconnect'>('enable');
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [unsavedCode, setUnsavedCode] = useState(false);
  // The error state's "Try again" retries the exact action that failed (enable / google /
  // reconnect) — syncNow can't recover it and would falsely report success.
  const [failedAction, setFailedAction] = useState<'enable' | 'google' | 'reconnect'>('enable');

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

  // Shared by the initial enable() and the reconnect() flows — both surface the same shape.
  // source records which flow needs a code, so the EnrollCodeModal submit routes back correctly.
  const routeEnableResult = (result: EnableResult, source: 'enable' | 'google' | 'reconnect') => {
    if (result.ok) {
      setEnabling(false);
      if (result.recoveryCode) {
        setRecoveryCode(result.recoveryCode);
      }
      return;
    }
    if (result.reason === 'needs-code') {
      // Google device-#2 enrollment isn't wired yet (follow-up); route its code entry through the
      // enable path — a brand-new Google sign-in (device #1) never needs a code.
      setEnrollSource(source === 'reconnect' ? 'reconnect' : 'enable');
      setEnrollOpen(true);
      return;
    }
    setFailedAction(source);
    // Format the cause into the message: a plain object logs as "[object Object]" in Chrome's
    // extension Errors panel and log aggregators, even though the console expands it.
    logger.error(
      `Cloud sync ${source} failed — reason=${result.reason}, detail=${result.detail ?? 'none'}`
    );
    useToastStore.getState().error(enableFailureMessage(result));
  };

  const handleEnable = async () => {
    setIsSubmitting(true);
    try {
      const result = await controller.enable(accountId, deviceName);
      routeEnableResult(result, 'enable');
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
      routeEnableResult(result, 'google');
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
      routeEnableResult(result, 'reconnect');
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
      result =
        enrollSource === 'reconnect'
          ? await controller.reconnect(code)
          : await controller.enable(accountId, deviceName, code);
    } catch (error) {
      logger.error('Enroll submit failed', error);
      return { ok: false, reason: 'error' };
    }
    if (result.ok) {
      setEnabling(false);
      if (result.recoveryCode) {
        setRecoveryCode(result.recoveryCode);
      }
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

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleSigningIn}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGoogleSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleGlyph />}
                {isGoogleSigningIn ? 'Signing in…' : 'Sign in with Google'}
              </button>
            </div>

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
            <div data-testid="sync-device-label" className="text-xs text-tertiary">
              Device: {deviceName}
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
