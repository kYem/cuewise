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
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  // Which flow opened EnrollCodeModal — reconnect reuses persisted creds, enable uses form inputs.
  const [enrollSource, setEnrollSource] = useState<'enable' | 'reconnect'>('enable');
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [unsavedCode, setUnsavedCode] = useState(false);

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
  const routeEnableResult = (result: EnableResult, source: 'enable' | 'reconnect') => {
    if (result.ok) {
      setEnabling(false);
      if (result.recoveryCode) {
        setRecoveryCode(result.recoveryCode);
      }
      return;
    }
    if (result.reason === 'needs-code') {
      setEnrollSource(source);
      setEnrollOpen(true);
      return;
    }
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
              <label htmlFor="sync-account-id" className="block text-sm font-medium text-primary">
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
            <p className="text-xs text-error">Something went wrong syncing your data.</p>
            <button
              type="button"
              onClick={handleSyncNow}
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
