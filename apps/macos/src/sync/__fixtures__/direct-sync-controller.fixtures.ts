import { configurePlatform } from '@cuewise/shared';
import { SessionManager } from '@cuewise/sync-client';
import { SyncEngine } from '@cuewise/sync-engine';
import {
  FakeApiClient,
  type FakeSyncServer,
} from '@cuewise/sync-engine/src/__fixtures__/fake-api-client';
import { FakeKvStore } from '@cuewise/sync-engine/src/__fixtures__/fake-kv-store';
import { FakeScheduler } from '@cuewise/sync-engine/src/__fixtures__/fake-scheduler';
import { OAuthCancelledError, type OAuthDriver } from '../../platform/oauth-driver';
import { buildDirectSyncController } from '../direct-sync-controller';

export const BASE_URL = 'https://api.test';

export interface Device {
  kv: FakeKvStore;
  apiClient: FakeApiClient;
  scheduler: FakeScheduler;
}

/** One "device": its own storage/scheduler, sharing the given fake server. Mirrors engine.test.ts. */
export function createDevice(server: FakeSyncServer): Device {
  return {
    kv: new FakeKvStore(),
    apiClient: new FakeApiClient(server),
    scheduler: new FakeScheduler(),
  };
}

/** Points @cuewise/storage's helpers (used by SyncEngine.backfillDirty) at this device's kv. */
export function useStorage(device: Pick<Device, 'kv'>): void {
  configurePlatform({ storage: device.kv });
}

/** Default driver: tests that never sign in with Google fail loudly if the flow runs anyway. */
export function unusedDriver(): OAuthDriver {
  return {
    async authorize(): Promise<string> {
      throw new Error('no OAuth flow expected in this test');
    },
    cancel(): void {},
  };
}

export interface FakeOAuthDriver {
  driver: OAuthDriver;
  /** Every startUrl authorize() was asked to open, in order. */
  calls: string[];
}

/** Scriptable driver: resolves every authorize() with `outcome`, or rejects if it's an Error. */
export function fakeOAuthDriver(outcome: string | Error): FakeOAuthDriver {
  const calls: string[] = [];
  return {
    calls,
    driver: {
      async authorize(startUrl: string): Promise<string> {
        calls.push(startUrl);
        if (outcome instanceof Error) {
          throw outcome;
        }
        return outcome;
      },
      cancel(): void {},
    },
  };
}

/**
 * A driver whose authorize() hangs until cancel() rejects it — for exercising the cancel path.
 * Await `waitForPending()` before cancelling: the controller runs PKCE before authorize(), so
 * an immediate cancel would fire into the pre-authorize gap and no-op.
 */
export function hangingOAuthDriver(): OAuthDriver & { waitForPending: () => Promise<void> } {
  let rejectPending: ((err: Error) => void) | null = null;
  let notifyPending: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    notifyPending = resolve;
  });
  return {
    waitForPending: () => pending,
    authorize(): Promise<string> {
      return new Promise<string>((_resolve, reject) => {
        rejectPending = reject;
        notifyPending();
      });
    },
    cancel(): void {
      if (rejectPending !== null) {
        rejectPending(new OAuthCancelledError());
        rejectPending = null;
      }
    },
  };
}

/** Builds a controller wired to a REAL SyncEngine over fakes (no createSyncEngine/HTTP involved). */
export function buildRealController(device: Device, oauthDriver: OAuthDriver = unusedDriver()) {
  return buildDirectSyncController<SyncEngine>({
    baseUrl: BASE_URL,
    keyStore: device.kv,
    oauthDriver,
    buildEngine: (trampolines) =>
      new SyncEngine({
        apiClient: device.apiClient,
        sessionManager: new SessionManager(device.kv),
        keyStore: device.kv,
        scheduler: device.scheduler,
        ...trampolines,
      }),
  });
}

// Corrupts only the checksum tail so length/alphabet/version stay valid but parseRecoveryCode
// recomputes a different checksum — avoids needing @cuewise/crypto as a direct test dependency.
export function corruptChecksum(code: string): string {
  const last = code[code.length - 1];
  const replacement = last === '0' ? '1' : '0';
  return `${code.slice(0, -1)}${replacement}`;
}
