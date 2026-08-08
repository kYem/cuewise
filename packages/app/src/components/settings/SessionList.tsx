import type { SyncSession } from '@cuewise/shared';
import { logger } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Check, Pencil, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '../../stores/toast-store';
import { useSyncController } from '../../sync/sync-controller';
import { formatMillisAgo } from '../../utils/reminder-date-utils';

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

export const SessionList: React.FC = () => {
  const controller = useSyncController();
  const [sessions, setSessions] = useState<SyncSession[] | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

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

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-secondary">Signed-in devices</div>
      {sessions.map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          onRename={handleRename}
          onRevoke={() => {
            /* wired to the confirm dialog in the next step */
          }}
        />
      ))}
    </div>
  );
};
