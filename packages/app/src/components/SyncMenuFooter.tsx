import { describeThrown, logger } from '@cuewise/shared';
import { RefreshCw, Settings } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMinuteNow } from '../hooks/useMinuteNow';
import { useToastStore } from '../stores/toast-store';
import {
  type SyncDetails,
  type SyncDetailsOptions,
  type SyncUiStatus,
  useSyncController,
} from '../sync/sync-controller';
import { formatMillisAgoPhrase } from '../utils/reminder-date-utils';

interface SyncMenuFooterProps {
  onOpenSettings: () => void;
}

// Neither can be fixed from a menu row, so the row sends the user where it can be.
const NEEDS_SETTINGS: readonly SyncUiStatus[] = ['needs_reauth', 'needs_enroll'];

// h-4 is text-xs's line-height, so the placeholder occupies exactly the row the email will:
// the status line below it does not move when details land.
const EMAIL_SKELETON_ROW = 'flex h-4 items-center';

const CACHED: SyncDetailsOptions = { cached: true };

const LABELS: Partial<Record<SyncUiStatus, string>> = {
  connecting: 'Connecting…',
  syncing: 'Syncing…',
  error: 'Sync failed',
  needs_reauth: 'Sign-in expired',
  needs_enroll: 'Needs recovery code',
};

// `role="menu"` may only contain menuitem/menuitemcheckbox/menuitemradio/group/separator, so this
// is one `menuitem` button, not a div-with-a-button; the visible markup below is aria-hidden.
export const SyncMenuFooter: React.FC<SyncMenuFooterProps> = ({ onOpenSettings }) => {
  const controller = useSyncController();
  const [status, setStatus] = useState<SyncUiStatus | null>(() => controller?.getStatus() ?? null);
  const [details, setDetails] = useState<SyncDetails | null>(null);
  const [detailsPending, setDetailsPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = useMinuteNow();
  // Guards two concurrent getDetails() callers: a host that emits 'syncing' mid-syncNow (macOS)
  // re-fetches on both that transition and the back-to-active one, while handleSync fetches its
  // own refresh — only the newest generation may paint.
  const detailsGenRef = useRef(0);

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
    detailsGenRef.current += 1;
    const gen = detailsGenRef.current;
    setDetailsPending(true);
    // The recorded answer paints at once; the server's replaces it, and never the other way round.
    let fresh = false;
    controller.getDetails(CACHED).then((cached) => {
      if (detailsGenRef.current === gen && !fresh && cached !== null) {
        setDetails(cached);
      }
    });
    controller.getDetails().then((next) => {
      if (detailsGenRef.current !== gen) {
        return;
      }
      setDetailsPending(false);
      // A transient null (offline, slow host) must not blank out details a fresher fetch painted.
      if (next !== null) {
        fresh = true;
        setDetails(next);
      }
    });
  }, [controller, status]);

  if (controller === null || status === null || status === 'off') {
    return null;
  }

  const needsSettings = NEEDS_SETTINGS.includes(status);
  // The adapter status covers syncs this row did not start; `busy` covers the extension, whose
  // bridge never emits 'syncing' at all.
  const inProgress = busy || status === 'syncing';
  const lastSyncedAt = details?.lastSyncedAt ?? null;
  const syncedLabel =
    lastSyncedAt === null
      ? 'Synced'
      : `Synced ${formatMillisAgoPhrase(lastSyncedAt, now.getTime())}`;
  const label = inProgress ? 'Syncing…' : (LABELS[status] ?? syncedLabel);

  const handleSync = async (): Promise<void> => {
    setBusy(true);
    try {
      await controller.syncNow();
      detailsGenRef.current += 1;
      const gen = detailsGenRef.current;
      // A sync cannot change the account, so re-read the recorded stamp; with none recorded, ask.
      const next = (await controller.getDetails(CACHED)) ?? (await controller.getDetails());
      if (detailsGenRef.current === gen && next !== null) {
        setDetails(next);
      }
    } catch (error) {
      logger.error(`Cloud sync sync-now failed: ${describeThrown(error)}`, error);
      useToastStore.getState().error("Couldn't sync right now — please try again.");
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
          {needsSettings ? (
            <Settings className="w-4 h-4 text-primary-600" />
          ) : (
            <RefreshCw className={`w-4 h-4 text-primary-600 ${inProgress ? 'animate-spin' : ''}`} />
          )}
        </div>
      </div>
    </button>
  );
};
