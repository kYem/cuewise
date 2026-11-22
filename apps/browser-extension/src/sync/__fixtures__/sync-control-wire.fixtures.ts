import type { SyncSession } from '@cuewise/shared';
import type {
  PairingCommitment,
  PendingPairing,
  SyncEngineControlSurface,
} from '@cuewise/sync-engine';
import { createChromeStorageMock, type MockChromeStorage } from '@cuewise/test-utils/mocks';
import { vi } from 'vitest';
import { handleSyncControlMessage, type SyncControlDeps } from '../handle-sync-control-message';
import { isSyncControlMessage } from '../sync-control-messages';

export const GOOGLE_ID_TOKEN = 'fake.jwt.token';
export const CAPTURED_CODE = 'CW1-CAPTD-00000-00000-00000-00000-00000';
export const TYPED_CODE = 'CW1-TYPED-00000-00000-00000-00000-00000';
export const REGENERATED_CODE = 'CW1-REGEN-00000-00000-00000-00000-00000';
const REDIRECT_URI = 'https://abjkbnhoepcnmbabflkedbapbldnpkbf.chromiumapp.org/';

export const SESSION: SyncSession = {
  id: 's2',
  deviceName: 'Phone',
  createdAt: 1,
  lastUsedAt: 2,
  current: false,
};

export const PAIRING_REQUEST: PendingPairing = {
  id: 'pairing-1',
  deviceName: 'Phone',
  requesterCommitment: 'commitment' as PairingCommitment,
  requesterPublicKey: null,
  requesterNonce: null,
  createdAt: 1,
};

// The worker's one-shot capture slot: drained before an enable, then holding the code it minted.
function workerDeps(): SyncControlDeps {
  return {
    takeRecoveryCode: vi.fn().mockReturnValueOnce(undefined).mockReturnValue(CAPTURED_CODE),
  };
}

// chrome.runtime carries JSON, so anything that does not survive it never reaches the other realm.
function overTheWire<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Points the page realm's chrome.runtime at the service worker's real control handler, routed the
 * way background.ts routes it. Returns the page's chrome.storage.local for seeding.
 */
export function connectPageToWorker(engine: SyncEngineControlSurface): MockChromeStorage {
  const deps = workerDeps();
  const local = createChromeStorageMock();
  const page = chrome as unknown as Record<string, unknown>;
  page.runtime = {
    sendMessage: vi.fn(async (message: unknown) => {
      const received = overTheWire(message);
      if (!isSyncControlMessage(received)) {
        return undefined;
      }
      return overTheWire(await handleSyncControlMessage(engine, received, deps));
    }),
  };
  page.storage = { local, onChanged: { addListener: vi.fn() } };
  page.permissions = { request: vi.fn().mockResolvedValue(true) };
  page.identity = {
    getRedirectURL: vi.fn(() => REDIRECT_URI),
    launchWebAuthFlow: vi.fn().mockResolvedValue(`${REDIRECT_URI}#id_token=${GOOGLE_ID_TOKEN}`),
  };
  return local;
}
