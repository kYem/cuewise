import { configurePlatform } from '@cuewise/shared';
import { ApiError, SessionManager } from '@cuewise/sync-client';
import { SyncEngine, type SyncEngineControlSurface, type SyncStatus } from '@cuewise/sync-engine';
import {
  FakeApiClient,
  FakeSyncServer,
} from '@cuewise/sync-engine/src/__fixtures__/fake-api-client';
import { FakeKvStore } from '@cuewise/sync-engine/src/__fixtures__/fake-kv-store';
import { FakeScheduler } from '@cuewise/sync-engine/src/__fixtures__/fake-scheduler';
import { describe, expect, it, vi } from 'vitest';
import { buildDirectSyncController, LAST_SYNC_CREDS_KEY } from './direct-sync-controller';

interface Device {
  kv: FakeKvStore;
  apiClient: FakeApiClient;
  scheduler: FakeScheduler;
}

/** One "device": its own storage/scheduler, sharing the given fake server. Mirrors engine.test.ts. */
function createDevice(server: FakeSyncServer): Device {
  return {
    kv: new FakeKvStore(),
    apiClient: new FakeApiClient(server),
    scheduler: new FakeScheduler(),
  };
}

/** Points @cuewise/storage's helpers (used by SyncEngine.backfillDirty) at this device's kv. */
function useStorage(device: Pick<Device, 'kv'>): void {
  configurePlatform({ storage: device.kv });
}

/** Builds a controller wired to a REAL SyncEngine over fakes (no createSyncEngine/HTTP involved). */
function buildRealController(device: Device, toast?: (msg: string) => void) {
  return buildDirectSyncController<SyncEngine>({
    keyStore: device.kv,
    toast,
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
function corruptChecksum(code: string): string {
  const last = code[code.length - 1];
  const replacement = last === '0' ? '1' : '0';
  return `${code.slice(0, -1)}${replacement}`;
}

describe('createDirectSyncController: enable()', () => {
  it('returns the captured one-shot recovery code for a brand-new account', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);

    const result = await controller.enable('cred-a', 'Device A');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected enable to succeed');
    }
    expect(result.recoveryCode).toEqual(expect.any(String));
  });

  it('omits the recovery code when device #2 enrolls with an existing code', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    const { controller: controllerA } = buildRealController(deviceA);
    const enableA = await controllerA.enable('cred-a', 'Device A');
    if (!enableA.ok) {
      throw new Error('expected device A enable to succeed');
    }
    const recoveryCode = enableA.recoveryCode;
    if (recoveryCode === undefined) {
      throw new Error('expected device A to receive a recovery code');
    }

    const deviceB = createDevice(server);
    useStorage(deviceB);
    const { controller: controllerB } = buildRealController(deviceB);

    const enableB = await controllerB.enable('cred-b', 'Device B', recoveryCode);

    expect(enableB).toEqual({ ok: true, recoveryCode: undefined });
  });

  it('maps a thrown RecoveryCodeRequiredError to needs-code', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    const { controller: controllerA } = buildRealController(deviceA);
    await controllerA.enable('cred-a', 'Device A');

    const deviceB = createDevice(server);
    useStorage(deviceB);
    const { controller: controllerB } = buildRealController(deviceB);

    const result = await controllerB.enable('cred-b', 'Device B');

    expect(result).toEqual({ ok: false, reason: 'needs-code' });
  });

  it('maps a malformed recovery code to bad-code with kind "format"', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    const { controller: controllerA } = buildRealController(deviceA);
    await controllerA.enable('cred-a', 'Device A');

    const deviceB = createDevice(server);
    useStorage(deviceB);
    const { controller: controllerB } = buildRealController(deviceB);

    const result = await controllerB.enable('cred-b', 'Device B', 'not-a-real-code');

    expect(result).toEqual({ ok: false, reason: 'bad-code', detail: 'format' });
  });

  it('maps an unsupported code version to bad-code with kind "version"', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    const { controller: controllerA } = buildRealController(deviceA);
    await controllerA.enable('cred-a', 'Device A');

    const deviceB = createDevice(server);
    useStorage(deviceB);
    const { controller: controllerB } = buildRealController(deviceB);

    const result = await controllerB.enable(
      'cred-b',
      'Device B',
      'CW2-00000-00000-00000-00000-00000-00000-00000'
    );

    expect(result).toEqual({ ok: false, reason: 'bad-code', detail: 'version' });
  });

  it('maps a checksum-mismatched code to bad-code with kind "checksum"', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    const { controller: controllerA } = buildRealController(deviceA);
    const enableA = await controllerA.enable('cred-a', 'Device A');
    if (!enableA.ok) {
      throw new Error('expected device A enable to succeed');
    }
    const recoveryCode = enableA.recoveryCode;
    if (recoveryCode === undefined) {
      throw new Error('expected device A to receive a recovery code');
    }

    const deviceB = createDevice(server);
    useStorage(deviceB);
    const { controller: controllerB } = buildRealController(deviceB);

    const result = await controllerB.enable('cred-b', 'Device B', corruptChecksum(recoveryCode));

    expect(result).toEqual({ ok: false, reason: 'bad-code', detail: 'checksum' });
  });

  it('maps a post-call signed_out status (401 during initial sign-in) to auth', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    device.apiClient.rejectExchangeWith401 = true;
    const { controller } = buildRealController(device);

    const result = await controller.enable('cred-a', 'Device A');

    expect(result).toEqual({ ok: false, reason: 'auth' });
  });

  it('maps a thrown ApiError(401) to auth', async () => {
    const engine: SyncEngineControlSurface = {
      enableSync: vi.fn().mockRejectedValue(new ApiError('invalid_token', 401)),
      disableSync: vi.fn().mockResolvedValue(undefined),
      regenerateRecoveryCode: vi.fn().mockResolvedValue('unused'),
      syncNow: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue('error' as SyncStatus),
    };
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      keyStore: new FakeKvStore(),
      buildEngine: () => engine,
    });

    const result = await controller.enable('cred-a', 'Device A');

    expect(result).toEqual({ ok: false, reason: 'auth' });
  });

  it('maps any other thrown error to error with its message as detail', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    vi.spyOn(device.apiClient, 'putRecoveryEnvelope').mockRejectedValueOnce(new Error('boom'));
    const { controller } = buildRealController(device);

    const result = await controller.enable('cred-a', 'Device A');

    expect(result).toEqual({ ok: false, reason: 'error', detail: 'boom' });
  });

  it('persists accountId/deviceName on success for a later reconnect()', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);

    await controller.enable('cred-a', 'Device A');

    expect(await device.kv.get(LAST_SYNC_CREDS_KEY, 'local')).toEqual({
      accountId: 'cred-a',
      deviceName: 'Device A',
    });
  });

  it('does not persist creds on a failed enable', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    const { controller: controllerA } = buildRealController(deviceA);
    await controllerA.enable('cred-a', 'Device A');

    const deviceB = createDevice(server);
    useStorage(deviceB);
    const { controller: controllerB } = buildRealController(deviceB);

    await controllerB.enable('cred-b', 'Device B');

    expect(await deviceB.kv.get(LAST_SYNC_CREDS_KEY, 'local')).toBeNull();
  });

  it('routes onQuarantine to the passed toast sink, never including secret material', () => {
    const toast = vi.fn();
    // The engine (real or fake) invokes onQuarantine from inside its own construction-time
    // trampolines — calling it here from buildEngine exercises that exact wiring.
    buildDirectSyncController<SyncEngineControlSurface>({
      keyStore: new FakeKvStore(),
      toast,
      buildEngine: (trampolines) => {
        trampolines.onQuarantine('goals/g1');
        return {
          enableSync: vi.fn().mockResolvedValue(undefined),
          disableSync: vi.fn().mockResolvedValue(undefined),
          regenerateRecoveryCode: vi.fn().mockResolvedValue('unused'),
          syncNow: vi.fn().mockResolvedValue(undefined),
          getStatus: vi.fn().mockReturnValue('active' as SyncStatus),
        };
      },
    });

    expect(toast).toHaveBeenCalledTimes(1);
    const [message] = toast.mock.calls[0];
    expect(message).toContain('goals/g1');
    expect(message).not.toMatch(/CW1-/);
  });
});

describe('createDirectSyncController: subscribe()', () => {
  it('emits mapped statuses as the engine transitions, ending at active', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);
    const seen: string[] = [];
    controller.subscribe((status) => seen.push(status));

    await controller.enable('cred-a', 'Device A');

    expect(seen).toContain('connecting');
    expect(seen[seen.length - 1]).toBe('active');
  });

  it('stops notifying a subscriber once unsubscribed', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    unsubscribe();

    await controller.enable('cred-a', 'Device A');

    expect(listener).not.toHaveBeenCalled();
  });

  it('getStatus() reflects the last emitted status synchronously', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);

    expect(controller.getStatus()).toBe('off');
    await controller.enable('cred-a', 'Device A');

    expect(controller.getStatus()).toBe('active');
  });

  it('wraps a self-initiated syncNow() with transient syncing/mapped-status emissions', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);
    await controller.enable('cred-a', 'Device A');
    const seen: string[] = [];
    controller.subscribe((status) => seen.push(status));

    await controller.syncNow();

    expect(seen[0]).toBe('syncing');
    expect(seen[seen.length - 1]).toBe('active');
  });
});

describe('createDirectSyncController: reconnect()', () => {
  it('calls enableSync with the persisted creds and no recovery code', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller, engine } = buildRealController(device);
    await controller.enable('cred-a', 'Device A');
    device.apiClient.rejectAllWith401 = true;
    await controller.syncNow();
    expect(engine.getStatus()).toBe('signed_out');
    device.apiClient.rejectAllWith401 = false;
    const enableSyncSpy = vi.spyOn(engine, 'enableSync');

    const result = await controller.reconnect();

    expect(enableSyncSpy).toHaveBeenCalledWith('dev', 'cred-a', 'Device A', undefined);
    expect(result).toEqual({ ok: true, recoveryCode: undefined });
    expect(engine.getStatus()).toBe('active');
  });

  it('returns an error result when no creds were ever persisted', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);

    const result = await controller.reconnect();

    expect(result).toEqual({ ok: false, reason: 'error' });
  });
});

describe('createDirectSyncController: enable() concurrency', () => {
  it('serializes two concurrent enable() calls so the capture slot never interleaves', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);

    const [first, second] = await Promise.all([
      controller.enable('cred-a', 'Device A'),
      controller.enable('cred-a', 'Device A'),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      throw new Error('expected both concurrent enables to succeed');
    }
    // The first call generates the account's key (capture fires); the second, serialized
    // behind it, resumes the already-persisted key silently — never fires the capture.
    const withCode = [first.recoveryCode, second.recoveryCode].filter((code) => code !== undefined);
    expect(withCode).toHaveLength(1);
  });
});

describe('createDirectSyncController: disable() / syncNow() error propagation', () => {
  it('rejects disable() when engine.disableSync() rejects, rather than swallowing it', async () => {
    const engine: SyncEngineControlSurface = {
      enableSync: vi.fn().mockResolvedValue(undefined),
      disableSync: vi.fn().mockRejectedValue(new Error('disable failed')),
      regenerateRecoveryCode: vi.fn().mockResolvedValue('unused'),
      syncNow: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue('active' as SyncStatus),
    };
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      keyStore: new FakeKvStore(),
      buildEngine: () => engine,
    });

    await expect(controller.disable()).rejects.toThrow('disable failed');
  });

  it('rejects syncNow() when engine.syncNow() rejects, and still reconciles status via finally', async () => {
    const engine: SyncEngineControlSurface = {
      enableSync: vi.fn().mockResolvedValue(undefined),
      disableSync: vi.fn().mockResolvedValue(undefined),
      regenerateRecoveryCode: vi.fn().mockResolvedValue('unused'),
      syncNow: vi.fn().mockRejectedValue(new Error('sync failed')),
      getStatus: vi.fn().mockReturnValue('error' as SyncStatus),
    };
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      keyStore: new FakeKvStore(),
      buildEngine: () => engine,
    });
    const seen: string[] = [];
    controller.subscribe((status) => seen.push(status));

    await expect(controller.syncNow()).rejects.toThrow('sync failed');

    expect(seen[0]).toBe('syncing');
    expect(seen[seen.length - 1]).toBe('error');
  });
});

describe('createDirectSyncController: enableWithGoogle() stub', () => {
  it('returns a not-yet-available error without calling the engine', async () => {
    const engine: SyncEngineControlSurface = {
      enableSync: vi.fn().mockResolvedValue(undefined),
      disableSync: vi.fn().mockResolvedValue(undefined),
      regenerateRecoveryCode: vi.fn().mockResolvedValue('unused'),
      syncNow: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue('disabled' as SyncStatus),
    };
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      keyStore: new FakeKvStore(),
      buildEngine: () => engine,
    });

    const result = await controller.enableWithGoogle('MacBook');

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      detail: 'Google sign-in on macOS is not available yet',
    });
    expect(engine.enableSync).not.toHaveBeenCalled();
  });
});
