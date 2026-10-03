import { useEffect, useState } from 'react';
import { type SyncUiStatus, useSyncController } from '../sync/sync-controller';

// Statuses with a live Cuewise session, which every Notion call rides on.
const SIGNED_IN: ReadonlySet<SyncUiStatus> = new Set([
  'active',
  'syncing',
  'error',
  'needs_enroll',
]);

export function useSyncSignedIn(): boolean {
  const syncController = useSyncController();
  const [status, setStatus] = useState<SyncUiStatus>(() => syncController?.getStatus() ?? 'off');

  useEffect(() => {
    if (syncController === null) {
      return;
    }
    setStatus(syncController.getStatus());
    return syncController.subscribe(setStatus);
  }, [syncController]);

  return SIGNED_IN.has(status);
}
