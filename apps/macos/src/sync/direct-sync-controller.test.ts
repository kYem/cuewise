import { logger } from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import type { SyncEngineControlSurface, SyncStatus } from '@cuewise/sync-engine';
import { FakeSyncServer } from '@cuewise/sync-engine/src/__fixtures__/fake-api-client';
import { FakeKvStore } from '@cuewise/sync-engine/src/__fixtures__/fake-kv-store';
import { describe, expect, it, vi } from 'vitest';
import {
  BASE_URL,
  buildRealController,
  corruptChecksum,
  createDevice,
  fakeOAuthDriver,
  unusedDriver,
  useStorage,
} from './__fixtures__/direct-sync-controller.fixtures';
import {
  buildDirectSyncController,
  GOOGLE_RETURN_URI,
  LAST_SYNC_CREDS_KEY,
} from './direct-sync-controller';
import { computeCodeChallenge } from './pkce';

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

  it('maps a post-call signed_out status (401 during initial sign-in) to auth, with a trace', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    device.apiClient.rejectExchangeWith401 = true;
    const { controller } = buildRealController(device);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const result = await controller.enable('cred-a', 'Device A');

    expect(result).toEqual({ ok: false, reason: 'auth' });
    // The engine swallows the 401 into signed_out — this branch is the only client-side trace.
    expect(warnSpy).toHaveBeenCalledWith('Cloud sync sign-in rejected (401) for provider dev');
    warnSpy.mockRestore();
  });

  it('maps a thrown ApiError(401) to auth', async () => {
    const engine: SyncEngineControlSurface = {
      enableSync: vi.fn().mockRejectedValue(new ApiError('invalid_token', 401)),
      disableSync: vi.fn().mockResolvedValue(undefined),
      regenerateRecoveryCode: vi.fn().mockResolvedValue('unused'),
      getAccount: vi.fn().mockResolvedValue(null),
      getLastSyncedAt: vi.fn().mockReturnValue(null),
      syncNow: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue('error' as SyncStatus),
    };
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
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
      provider: 'dev',
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
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      toast,
      buildEngine: (trampolines) => {
        trampolines.onQuarantine('goals/g1');
        return {
          enableSync: vi.fn().mockResolvedValue(undefined),
          disableSync: vi.fn().mockResolvedValue(undefined),
          regenerateRecoveryCode: vi.fn().mockResolvedValue('unused'),
          getAccount: vi.fn().mockResolvedValue(null),
          getLastSyncedAt: vi.fn().mockReturnValue(null),
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

    expect(enableSyncSpy).toHaveBeenCalledWith('dev', 'cred-a', 'Device A', {
      recoveryCode: undefined,
      codeVerifier: undefined,
    });
    expect(result).toEqual({ ok: true, recoveryCode: undefined });
    expect(engine.getStatus()).toBe('active');
  });

  it('routes legacy creds persisted without a provider through the silent dev path', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller, engine } = buildRealController(device);
    // A record persisted before the google flow existed: no provider field.
    await device.kv.set(
      LAST_SYNC_CREDS_KEY,
      { accountId: 'cred-a', deviceName: 'Device A' },
      'local'
    );
    const enableSyncSpy = vi.spyOn(engine, 'enableSync');

    const result = await controller.reconnect();

    expect(enableSyncSpy).toHaveBeenCalledWith('dev', 'cred-a', 'Device A', {
      recoveryCode: undefined,
      codeVerifier: undefined,
    });
    expect(result.ok).toBe(true);
  });

  it('treats a malformed persisted creds record as no creds instead of launching a broken flow', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);
    // A google record missing deviceName (corrupted / future-version): must fail at load.
    await device.kv.set(LAST_SYNC_CREDS_KEY, { provider: 'google' }, 'local');

    const result = await controller.reconnect();

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      detail: 'No saved sync account on this device',
    });
  });

  it('returns an error result when no creds were ever persisted', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);

    const result = await controller.reconnect();

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      detail: 'No saved sync account on this device',
    });
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
      getAccount: vi.fn().mockResolvedValue(null),
      getLastSyncedAt: vi.fn().mockReturnValue(null),
      syncNow: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockReturnValue('active' as SyncStatus),
    };
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.disable()).rejects.toThrow('disable failed');
  });

  it('rejects syncNow() when engine.syncNow() rejects, and still reconciles status via finally', async () => {
    const engine: SyncEngineControlSurface = {
      enableSync: vi.fn().mockResolvedValue(undefined),
      disableSync: vi.fn().mockResolvedValue(undefined),
      regenerateRecoveryCode: vi.fn().mockResolvedValue('unused'),
      getAccount: vi.fn().mockResolvedValue(null),
      getLastSyncedAt: vi.fn().mockReturnValue(null),
      syncNow: vi.fn().mockRejectedValue(new Error('sync failed')),
      getStatus: vi.fn().mockReturnValue('error' as SyncStatus),
    };
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });
    const seen: string[] = [];
    controller.subscribe((status) => seen.push(status));

    await expect(controller.syncNow()).rejects.toThrow('sync failed');

    expect(seen[0]).toBe('syncing');
    expect(seen[seen.length - 1]).toBe('error');
  });
});

describe('createDirectSyncController: getDetails()', () => {
  it('maps the engine account + lastSyncedAt into SyncDetails after an enable', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    device.apiClient.accountResult = { userId: 'user-1', email: 'kes@example.com' };
    const { controller } = buildRealController(device);
    await controller.enable('cred-a', 'Device A');

    const details = await controller.getDetails();

    expect(details).toEqual({
      accountEmail: 'kes@example.com',
      accountId: 'user-1',
      lastSyncedAt: expect.any(Number),
    });
  });

  it('resolves null when the engine has no session', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);

    await expect(controller.getDetails()).resolves.toBeNull();
  });
});

describe('createDirectSyncController: enableWithGoogle()', () => {
  it('runs the full bounce: PKCE start URL → callback code → google exchange with the verifier', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { driver, calls } = fakeOAuthDriver(`${GOOGLE_RETURN_URI}?code=one-time-x`);
    const { controller } = buildRealController(device, driver);

    const result = await controller.enableWithGoogle('MacBook');

    expect(result.ok).toBe(true);
    // The start URL targets our server bounce with the constant return_uri.
    expect(calls).toHaveLength(1);
    const startUrl = new URL(calls[0]);
    expect(`${startUrl.origin}${startUrl.pathname}`).toBe(`${BASE_URL}/v1/auth/google/start`);
    expect(startUrl.searchParams.get('return_uri')).toBe(GOOGLE_RETURN_URI);
    // The exchange carried the bounced code and a verifier whose S256 matches the start URL's
    // challenge — the whole PKCE chain, end to end.
    const exchange = device.apiClient.lastExchangeRequest;
    if (exchange === null || exchange.provider !== 'google' || !('codeVerifier' in exchange)) {
      throw new Error('expected a google exchange carrying a codeVerifier');
    }
    expect(exchange.credential).toBe('one-time-x');
    expect(exchange.deviceName).toBe('MacBook');
    await expect(computeCodeChallenge(exchange.codeVerifier)).resolves.toBe(
      startUrl.searchParams.get('code_challenge')
    );
  });

  it('persists only the provider marker and device name — never the burned code', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { driver } = fakeOAuthDriver(`${GOOGLE_RETURN_URI}?code=one-time-x`);
    const { controller } = buildRealController(device, driver);

    await controller.enableWithGoogle('MacBook');

    expect(await device.kv.get(LAST_SYNC_CREDS_KEY, 'local')).toEqual({
      provider: 'google',
      deviceName: 'MacBook',
    });
  });

  it('maps a driver failure (timeout, browser refusal) to error without exchanging', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { driver } = fakeOAuthDriver(new Error('Timed out waiting for the sign-in callback'));
    const { controller } = buildRealController(device, driver);

    const result = await controller.enableWithGoogle('MacBook');

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      detail: 'Timed out waiting for the sign-in callback',
    });
    expect(device.apiClient.lastExchangeRequest).toBeNull();
  });

  it('maps a server-relayed OAuth error (user cancelled at Google) to auth', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { driver } = fakeOAuthDriver(`${GOOGLE_RETURN_URI}?error=access_denied`);
    const { controller } = buildRealController(device, driver);

    const result = await controller.enableWithGoogle('MacBook');

    expect(result).toEqual({ ok: false, reason: 'auth', detail: 'cancelled' });
    expect(device.apiClient.lastExchangeRequest).toBeNull();
  });

  it('maps a server-relayed auth_failed (verification failure) to auth without a cancel detail', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { driver } = fakeOAuthDriver(`${GOOGLE_RETURN_URI}?error=auth_failed`);
    const { controller } = buildRealController(device, driver);

    const result = await controller.enableWithGoogle('MacBook');

    expect(result).toEqual({ ok: false, reason: 'auth', detail: undefined });
    expect(device.apiClient.lastExchangeRequest).toBeNull();
  });

  it('maps a server-relayed server_error to error with a retryable detail', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { driver } = fakeOAuthDriver(`${GOOGLE_RETURN_URI}?error=server_error`);
    const { controller } = buildRealController(device, driver);

    const result = await controller.enableWithGoogle('MacBook');

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      detail: 'Sign-in failed on the server',
    });
    expect(device.apiClient.lastExchangeRequest).toBeNull();
  });

  it('maps a callback with neither code nor error to error', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { driver } = fakeOAuthDriver(GOOGLE_RETURN_URI);
    const { controller } = buildRealController(device, driver);

    const result = await controller.enableWithGoogle('MacBook');

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      detail: 'Sign-in callback did not include a code',
    });
    expect(device.apiClient.lastExchangeRequest).toBeNull();
  });

  it('reports canEnableWithGoogle() as true so the UI shows the button', () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);

    expect(controller.canEnableWithGoogle()).toBe(true);
  });

  it('reconnect() after a google enable re-runs the OAuth flow with a fresh challenge', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { driver, calls } = fakeOAuthDriver(`${GOOGLE_RETURN_URI}?code=one-time-x`);
    const { controller } = buildRealController(device, driver);
    await controller.enableWithGoogle('MacBook');

    const result = await controller.reconnect();

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    const firstChallenge = new URL(calls[0]).searchParams.get('code_challenge');
    const secondChallenge = new URL(calls[1]).searchParams.get('code_challenge');
    expect(secondChallenge).not.toBe(firstChallenge);
  });
});
