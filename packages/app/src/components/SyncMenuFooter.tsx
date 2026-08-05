import { RefreshCw } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { type SyncDetails, type SyncUiStatus, useSyncController } from '../sync/sync-controller';
import { formatMillisAgo } from '../utils/reminder-date-utils';

interface SyncMenuFooterProps {
  onOpenSettings: () => void;
}

// Neither can be fixed from a menu row, so the row sends the user where it can be.
const NEEDS_SETTINGS: readonly SyncUiStatus[] = ['needs_reauth', 'needs_enroll'];

// h-4 is text-xs's line-height, so the placeholder occupies exactly the row the email will:
// the status line below it does not move when the details fetch lands.
const EMAIL_SKELETON_ROW = 'flex h-4 items-center';

const LABELS: Partial<Record<SyncUiStatus, string>> = {
  connecting: 'Connecting…',
  syncing: 'Syncing…',
  error: 'Sync failed',
  needs_reauth: 'Sign-in expired',
  needs_enroll: 'Needs recovery code',
};

/**
 * A single `menuitem` button, not a div-with-a-button: the quick menu is `role="menu"`, which may
 * only contain menuitem/menuitemcheckbox/menuitemradio/group/separator — a footer div would be
 * announced wrong or skipped. The visible email/status/icon markup is aria-hidden and carries no
 * meaning of its own; aria-label is the one accessible name, built from the same state so the two
 * can never disagree.
 */
export const SyncMenuFooter: React.FC<SyncMenuFooterProps> = ({ onOpenSettings }) => {
  const controller = useSyncController();
  const [status, setStatus] = useState<SyncUiStatus | null>(() => controller?.getStatus() ?? null);
  const [details, setDetails] = useState<SyncDetails | null>(null);
  const [detailsPending, setDetailsPending] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (controller === null) {
      return;
    }
    // subscribe() only reports future transitions (matches every host adapter), so the current
    // status has to be read explicitly or the row would stay hidden until the next one.
    setStatus(controller.getStatus());
    return controller.subscribe(setStatus);
  }, [controller]);

  useEffect(() => {
    if (controller === null || status === null || status === 'off') {
      return;
    }
    let cancelled = false;
    setDetailsPending(true);
    controller.getDetails().then((next) => {
      if (!cancelled) {
        setDetailsPending(false);
        setDetails(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [controller, status]);

  if (controller === null || status === null || status === 'off') {
    return null;
  }

  const needsSettings = NEEDS_SETTINGS.includes(status);
  // The adapter status covers syncs this row did not start; `busy` covers the extension, whose
  // bridge never emits 'syncing' at all.
  const inProgress = busy || status === 'syncing';
  const label = inProgress
    ? 'Syncing…'
    : (LABELS[status] ??
      (details?.lastSyncedAt != null
        ? `Synced ${formatMillisAgo(details.lastSyncedAt)}`
        : 'Synced'));

  const handleSync = async (): Promise<void> => {
    setBusy(true);
    try {
      await controller.syncNow();
      setDetails(await controller.getDetails());
    } finally {
      setBusy(false);
    }
  };

  const handleClick = () => {
    if (needsSettings) {
      onOpenSettings();
      return;
    }
    void handleSync();
  };

  const accountClause =
    details?.accountEmail != null ? `signed in as ${details.accountEmail}` : 'signed in';
  const actionClause = needsSettings ? 'Select to open settings.' : 'Select to sync now.';
  const ariaLabel = `Cloud sync: ${accountClause}, ${label.toLowerCase()}. ${actionClause}`;

  return (
    <button
      type="button"
      role="menuitem"
      onClick={handleClick}
      disabled={inProgress && !needsSettings}
      aria-label={ariaLabel}
      data-testid="sync-menu-footer"
      className="w-full flex flex-col items-start gap-1 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider disabled:opacity-50"
    >
      <div aria-hidden="true" className="flex w-full flex-col gap-1">
        {details?.accountEmail != null && (
          <p className="text-xs text-secondary truncate w-full text-left">{details.accountEmail}</p>
        )}
        {details === null && detailsPending && (
          <div data-testid="sync-menu-email-skeleton" className={EMAIL_SKELETON_ROW}>
            <span className="h-3 w-40 animate-pulse rounded bg-surface-variant" />
          </div>
        )}
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          <RefreshCw className={`w-4 h-4 text-primary-600 ${inProgress ? 'animate-spin' : ''}`} />
        </div>
      </div>
    </button>
  );
};
