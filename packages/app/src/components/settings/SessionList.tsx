import type { SyncSession } from '@cuewise/shared';
import { logger } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Check, Pencil, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '../../stores/toast-store';
import { useSyncController } from '../../sync/sync-controller';
import { formatMillisAgo } from '../../utils/reminder-date-utils';
import { Modal } from '../Modal';

const ROW = 'flex items-start justify-between gap-3 border-t border-divider py-2 first:border-t-0';
const META = 'text-xs text-tertiary';
const GHOST_BUTTON =
  'rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-surface-variant disabled:cursor-not-allowed disabled:opacity-50';

// Two sessions can legitimately share a device name (a reinstall leaves the old row live until it
// expires), so this line is what tells them apart and is always rendered.
function lastActiveLabel(session: SyncSession): string {
  if (session.lastUsedAt === null) {
    return 'Not used yet';
  }
  return `Last active ${formatMillisAgo(session.lastUsedAt)}`;
}

interface SessionRowProps {
  session: SyncSession;
  onRename: (id: string, deviceName: string) => Promise<void>;
  onRevoke: (session: SyncSession) => void;
}

const SessionRow: React.FC<SessionRowProps> = ({ session, onRename, onRevoke }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(session.deviceName);

  const startEditing = () => {
    setDraft(session.deviceName);
    setIsEditing(true);
  };

  const commit = async () => {
    const next = draft.trim();
    setIsEditing(false);
    if (next.length === 0 || next === session.deviceName) {
      return;
    }
    await onRename(session.id, next);
  };

  return (
    <div data-testid={`session-row-${session.id}`} className={ROW}>
      <div className="flex min-w-0 flex-col gap-0.5">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              // biome-ignore lint/a11y/noAutofocus: the input only exists after a deliberate click
              autoFocus
              aria-label="Device name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void commit();
                }
                if (e.key === 'Escape') {
                  setIsEditing(false);
                }
              }}
              className="w-40 rounded border border-border bg-surface px-2 py-1 text-sm text-primary"
            />
            <button type="button" aria-label="Save name" className={GHOST_BUTTON} onClick={commit}>
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Cancel rename"
              className={GHOST_BUTTON}
              onClick={() => setIsEditing(false)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid={`session-name-${session.id}`}
            onClick={startEditing}
            className="group flex items-center gap-1.5 text-left text-sm font-medium text-primary"
          >
            <span className="truncate">{session.deviceName}</span>
            <Pencil className="h-3 w-3 flex-none text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
            {session.current && (
              <span className="flex-none rounded-full bg-surface-variant px-2 py-0.5 text-[10px] font-medium text-secondary">
                This device
              </span>
            )}
          </button>
        )}
        <span data-testid={`session-last-active-${session.id}`} className={META}>
          {lastActiveLabel(session)}
        </span>
      </div>
      {!session.current && (
        <button
          type="button"
          onClick={() => onRevoke(session)}
          className={cn(GHOST_BUTTON, 'flex-none')}
        >
          Revoke
        </button>
      )}
    </div>
  );
};

interface SessionListProps {
  /**
   * Opens the panel's existing Regenerate control. Offered inside the revoke dialog because a
   * copied recovery code plus access to the provider account could re-enrol the cut device —
   * ordered before the confirm, following 1Password's regenerate-then-deauthorize runbook.
   */
  onRegenerateRecoveryCode?: () => void;
}

export const SessionList: React.FC<SessionListProps> = ({ onRegenerateRecoveryCode }) => {
  const controller = useSyncController();
  const [sessions, setSessions] = useState<SyncSession[] | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<SyncSession | null>(null);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);
  const [isConfirmingRevokeOthers, setIsConfirmingRevokeOthers] = useState(false);

  const refresh = useCallback(async () => {
    if (controller === null) {
      return;
    }
    setSessions(await controller.listSessions());
    setHasLoaded(true);
  }, [controller]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRename = async (id: string, deviceName: string) => {
    if (controller === null) {
      return;
    }
    try {
      await controller.renameSession(id, deviceName);
      await refresh();
    } catch (error) {
      logger.error('Cloud sync rename device failed', error);
      useToastStore.getState().error("Couldn't rename that device — please try again.");
      await refresh();
    }
  };

  const handleRevoke = async () => {
    if (controller === null || pendingRevoke === null) {
      return;
    }
    const target = pendingRevoke;
    setPendingRevoke(null);
    try {
      await controller.revokeSession(target.id);
      await refresh();
    } catch (error) {
      logger.error('Cloud sync revoke device failed', error);
      useToastStore.getState().error("Couldn't sign that device out — please try again.");
    }
  };

  const handleRevokeOthers = async () => {
    if (controller === null) {
      return;
    }
    setIsConfirmingRevokeOthers(false);
    setIsRevokingOthers(true);
    try {
      const revoked = await controller.revokeOtherSessions();
      await refresh();
      useToastStore
        .getState()
        .success(
          revoked === 1 ? 'Signed out 1 other device' : `Signed out ${revoked} other devices`
        );
    } catch (error) {
      logger.error('Cloud sync revoke other devices failed', error);
      useToastStore.getState().error("Couldn't sign the other devices out — please try again.");
    } finally {
      setIsRevokingOthers(false);
    }
  };

  if (controller === null) {
    return null;
  }

  if (!hasLoaded) {
    return (
      <div data-testid="session-list-skeleton" aria-hidden="true" className="flex h-4 items-center">
        <span className="h-3 w-48 animate-pulse rounded bg-surface-variant" />
      </div>
    );
  }

  if (sessions === null) {
    return (
      <div data-testid="session-list-unavailable" className={META}>
        Couldn't load your signed-in devices.
      </div>
    );
  }

  const otherCount = sessions.filter((s) => !s.current).length;

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-secondary">Signed-in devices</div>
      {sessions.map((s) => (
        <SessionRow key={s.id} session={s} onRename={handleRename} onRevoke={setPendingRevoke} />
      ))}

      {otherCount > 0 && (
        <button
          type="button"
          onClick={() => setIsConfirmingRevokeOthers(true)}
          disabled={isRevokingOthers}
          className={cn(GHOST_BUTTON, 'mt-2 w-fit')}
        >
          Sign out all other devices
        </button>
      )}

      <Modal
        isOpen={pendingRevoke !== null}
        onClose={() => setPendingRevoke(null)}
        title="Sign out this device?"
        size="md"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-secondary">
            {pendingRevoke === null ? '' : `${pendingRevoke.deviceName} will stop syncing.`} It
            stops receiving new data, but anything already synced stays on that device.
          </p>
          <p className={META}>
            If the device was lost or stolen, regenerate your recovery code first — someone who
            copied it could otherwise use it to enrol again.
          </p>
          {onRegenerateRecoveryCode !== undefined && (
            <button
              type="button"
              onClick={onRegenerateRecoveryCode}
              className={cn(GHOST_BUTTON, 'w-fit')}
            >
              Regenerate recovery code
            </button>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={GHOST_BUTTON} onClick={() => setPendingRevoke(null)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700"
            >
              Revoke
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isConfirmingRevokeOthers}
        onClose={() => setIsConfirmingRevokeOthers(false)}
        title="Sign out all other devices?"
        size="md"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-secondary">
            Every device except this one will stop syncing and need to sign in again.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className={GHOST_BUTTON}
              onClick={() => setIsConfirmingRevokeOthers(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRevokeOthers}
              className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
