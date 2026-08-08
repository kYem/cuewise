import type { SyncSession } from '@cuewise/shared';
import { render } from '@testing-library/react';
import { FakeSyncController } from '../../../sync/__fixtures__/fake-sync-controller';
import { SyncControllerContext } from '../../../sync/sync-controller';
import { SessionList } from '../SessionList';

const HOUR_MS = 60 * 60 * 1000;

export function session(overrides: Partial<SyncSession> = {}): SyncSession {
  return {
    id: 's1',
    deviceName: 'laptop',
    createdAt: Date.now() - 30 * 24 * HOUR_MS,
    lastUsedAt: Date.now() - HOUR_MS,
    current: false,
    ...overrides,
  };
}

export function controllerWith(sessions: SyncSession[] | null): FakeSyncController {
  const controller = new FakeSyncController();
  controller.sessionsResult = sessions;
  return controller;
}

export function renderSessionList(
  controller: FakeSyncController,
  onRegenerateRecoveryCode?: () => void
) {
  return render(
    <SyncControllerContext.Provider value={controller}>
      <SessionList onRegenerateRecoveryCode={onRegenerateRecoveryCode} />
    </SyncControllerContext.Provider>
  );
}
