import { logger } from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import type { PendingPairing, SyncEngineControlSurface, SyncStatus } from '@cuewise/sync-engine';
import { CLOUD_SYNC_ENABLED_KEY } from '@cuewise/sync-engine';
import { FakeSyncServer } from '@cuewise/sync-engine/src/__fixtures__/fake-api-client';
import { fakeControlSurface } from '@cuewise/sync-engine/src/__fixtures__/fake-control-surface';
import { FakeKvStore } from '@cuewise/sync-engine/src/__fixtures__/fake-kv-store';
import { describe, expect, it, vi } from 'vitest';
import {
  BASE_URL,
  buildRealController,
  corruptChecksum,
  createDevice,
  fakeOAuthDriver,
  hangingOAuthDriver,
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

  // The mint happens before the enabled-flag write, and the account it opens outlives the failed
  // attempt — the server envelope has no delete call — so swallowing the code locks the user out.
  it('surfaces the minted code when the enable throws after minting it', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    device.kv.failSetsForKey = CLOUD_SYNC_ENABLED_KEY;
    const { controller } = buildRealController(device);

    const result = await controller.enable('cred-a', 'Device A');

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty('recoveryCode', expect.any(String));
  });

  // The other post-mint exit: the engine swallows a 401 into signed_out rather than throwing, so
  // this lands on runEnable's status branch instead of its catch.
  it('surfaces the minted code when the initial sync 401s into signed_out', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    device.apiClient.rejectNextGetChangesWith401 = true;
    const { controller } = buildRealController(device);

    const result = await controller.enable('cred-a', 'Device A');

    expect(result).toMatchObject({ ok: false, reason: 'auth' });
    expect(result).toHaveProperty('recoveryCode', expect.any(String));
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
    const engine = fakeControlSurface({
      enableSync: vi.fn().mockRejectedValue(new ApiError('invalid_token', 401)),
      getStatus: vi.fn().mockReturnValue('error' as SyncStatus),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    const result = await controller.enable('cred-a', 'Device A');

    expect(result).toEqual({ ok: false, reason: 'auth' });
  });

  it('maps a post-call disabled status to a cancel, never to ok', async () => {
    let trampolines: { onRecoveryCode: (code: string) => void } | undefined;
    const engine = fakeControlSurface({
      getStatus: vi.fn().mockReturnValue('disabled' as SyncStatus),
      // The engine hands the code over before it notices it was superseded.
      enableSync: vi.fn().mockImplementation(async () => {
        if (trampolines === undefined) {
          throw new Error('buildEngine never ran, so there are no trampolines to mint through');
        }
        trampolines.onRecoveryCode('CW1-ABC');
      }),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: (built) => {
        trampolines = built;
        return engine;
      },
    });

    const result = await controller.enable('cred-a', 'Device A');

    expect(result).toEqual({ ok: false, reason: 'cancelled', recoveryCode: 'CW1-ABC' });
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
        return fakeControlSurface();
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

  it('keeps needs_enroll distinct from needs_reauth when mapping to the UI', async () => {
    // Collapsing these is one line, and it puts "Sign-in expired" back in front of a keyless user.
    const engine = fakeControlSurface({
      getStatus: vi.fn().mockReturnValue('needs_enroll' as SyncStatus),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    expect(controller.getStatus()).toBe('needs_enroll');
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
    const engine = fakeControlSurface({
      disableSync: vi.fn().mockRejectedValue(new Error('disable failed')),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.disable()).rejects.toThrow('disable failed');
  });

  it('rejects syncNow() when engine.syncNow() rejects, and still reconciles status via finally', async () => {
    const engine = fakeControlSurface({
      syncNow: vi.fn().mockRejectedValue(new Error('sync failed')),
      getStatus: vi.fn().mockReturnValue('error' as SyncStatus),
    });
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

describe('createDirectSyncController: syncNow() outcome / getLastCycle()', () => {
  it('returns the outcome the engine reports, rather than discarding it', async () => {
    const engine = fakeControlSurface({
      syncNow: vi.fn().mockResolvedValue({ kind: 'resynced' }),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    const outcome = await controller.syncNow();

    expect(outcome).toEqual({ kind: 'resynced' });
  });

  it('getLastCycle() resolves the outcome of the engine-reported last cycle', async () => {
    const engine = fakeControlSurface({
      getLastCycle: vi.fn().mockReturnValue({
        known: true,
        cycle: { at: 1_700_000_000_000, outcome: { kind: 'no-key' } },
      }),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.getLastCycle()).resolves.toEqual({
      available: true,
      outcome: { kind: 'no-key' },
    });
  });

  it('getLastCycle() reports an available read with no outcome when no cycle has run', async () => {
    // The panel clears its badge on this, so a genuinely-never-run cycle must report available —
    // only a record that exists and cannot be read may answer unavailable.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const { controller } = buildRealController(device);

    await expect(controller.getLastCycle()).resolves.toEqual({ available: true, outcome: null });
  });

  it('getLastCycle() reports unavailable when the engine cannot read its stored record', async () => {
    const engine = fakeControlSurface({
      getLastCycle: vi.fn().mockReturnValue({ known: false }),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.getLastCycle()).resolves.toEqual({ available: false });
  });

  it('getLastCycle() awaits hydration before reading, so a cold read cannot answer early', async () => {
    const order: string[] = [];
    const engine = fakeControlSurface({
      getLastCycle: vi.fn(() => {
        order.push('read');
        return { known: true, cycle: null };
      }),
      ensureHydrated: vi.fn(async () => {
        // Yield first, or the push lands synchronously and a caller that never awaits still
        // produces this order — the assertion would pass against the very bug it guards.
        await Promise.resolve();
        order.push('hydrate');
      }),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await controller.getLastCycle();

    expect(order).toEqual(['hydrate', 'read']);
  });

  it('getDetails() awaits hydration too, since it owns the last-synced stamp', async () => {
    const order: string[] = [];
    const engine = fakeControlSurface({
      getAccount: vi.fn().mockResolvedValue({ userId: 'u1', email: null }),
      getLastSyncedAt: vi.fn(() => {
        order.push('read');
        return null;
      }),
      ensureHydrated: vi.fn(async () => {
        await Promise.resolve();
        order.push('hydrate');
      }),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await controller.getDetails();

    expect(order).toEqual(['hydrate', 'read']);
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
      // The enrol created it, so a device that has only just connected already knows.
      recoveryEnvelope: 'present',
    });
  });

  it('asks the server about the recovery envelope when the caller opts in', async () => {
    // ENG-98 moved the check off the pull loop and onto this lookup, so opening the settings panel
    // is now what refreshes the banner — a stale `true` would hide a real finding.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    device.apiClient.accountResult = { userId: 'user-1', email: null };
    const { controller } = buildRealController(device);
    await controller.enable('cred-a', 'Device A');
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const envelopeSpy = vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockResolvedValue(null);

    const details = await controller.getDetails({ refreshRecoveryEnvelope: true });

    expect(envelopeSpy).toHaveBeenCalled();
    expect(details?.recoveryEnvelope).toBe('missing');
  });

  it('reports the recorded answer without asking, for a caller that does not opt in', async () => {
    // The quick-menu footer shows the identity alone; buying it a request for a finding it never
    // renders is the waste ENG-98 is about, in miniature.
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    device.apiClient.accountResult = { userId: 'user-1', email: null };
    const { controller } = buildRealController(device);
    await controller.enable('cred-a', 'Device A');
    const envelopeSpy = vi.spyOn(device.apiClient, 'getRecoveryEnvelope').mockResolvedValue(null);

    const details = await controller.getDetails();

    expect(envelopeSpy).not.toHaveBeenCalled();
    expect(details?.recoveryEnvelope).toBe('present');
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

  it('enrollWithCode() finishes a google enroll on the live session without a second bounce', async () => {
    const server = new FakeSyncServer();
    const deviceA = createDevice(server);
    useStorage(deviceA);
    const enableA = await buildRealController(deviceA).controller.enable('cred-a', 'Device A');
    if (!enableA.ok || enableA.recoveryCode === undefined) {
      throw new Error('expected device A to receive a recovery code');
    }

    // Device B: a first google sign-in returns needs-code but leaves the session saved.
    const deviceB = createDevice(server);
    useStorage(deviceB);
    const { driver, calls } = fakeOAuthDriver(`${GOOGLE_RETURN_URI}?code=one-time-x`);
    const { controller } = buildRealController(deviceB, driver);
    const first = await controller.enableWithGoogle('MacBook');
    expect(first).toEqual({ ok: false, reason: 'needs-code' });
    const exchangesAfterSignIn = deviceB.apiClient.exchangeCount;

    const result = await controller.enrollWithCode?.('MacBook', enableA.recoveryCode);

    expect(result).toEqual({ ok: true, recoveryCode: undefined });
    // No second browser bounce (authorize called once, for the sign-in) and no second exchange.
    expect(calls).toHaveLength(1);
    expect(deviceB.apiClient.exchangeCount).toBe(exchangesAfterSignIn);
    expect(await deviceB.kv.get(LAST_SYNC_CREDS_KEY, 'local')).toEqual({
      provider: 'google',
      deviceName: 'MacBook',
    });
  });

  it('cancelEnableWithGoogle() settles a pending flow as a quiet cancel, never exchanging', async () => {
    const server = new FakeSyncServer();
    const device = createDevice(server);
    useStorage(device);
    const driver = hangingOAuthDriver();
    const { controller } = buildRealController(device, driver);

    const pending = controller.enableWithGoogle('MacBook');
    await driver.waitForPending();
    controller.cancelEnableWithGoogle?.();

    await expect(pending).resolves.toEqual({ ok: false, reason: 'auth', detail: 'cancelled' });
    expect(device.apiClient.lastExchangeRequest).toBeNull();
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

// beginPairing/pollPairing/pollApproval are bare passthroughs (no local try/catch — they rely on
// the engine's own never-throws contract, proven in sync-engine's engine.pairing.test.ts). The
// other four (listPairingRequests/commitPairing/approvePairing/denyPairing) are NOT self-contained
// on the engine side, so the controller wraps each in its own try/catch to keep its never-throws
// contract — that wrapping, and its exact fallback value, is what these tests pin.
describe('createDirectSyncController: pairing', () => {
  const REQUEST: PendingPairing = {
    id: 'pairing-1',
    deviceName: 'phone',
    requesterCommitment: 'commitment',
    requesterPublicKey: null,
    requesterNonce: null,
    createdAt: 1,
  };

  it('beginPairing() forwards the engine result unchanged', async () => {
    const engine = fakeControlSurface({
      beginPairing: vi.fn().mockResolvedValue({ pairingId: 'pairing-1' }),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.beginPairing()).resolves.toEqual({ pairingId: 'pairing-1' });
  });

  it('pollPairing() forwards the engine result unchanged', async () => {
    const engine = fakeControlSurface({
      pollPairing: vi.fn().mockResolvedValue({ kind: 'confirm', sas: '123456' }),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.pollPairing()).resolves.toEqual({ kind: 'confirm', sas: '123456' });
  });

  it('pollApproval() forwards the id and row to the engine and its result unchanged', async () => {
    const pollApproval = vi.fn().mockResolvedValue({ kind: 'waiting' });
    const engine = fakeControlSurface({ pollApproval });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.pollApproval('pairing-1', REQUEST)).resolves.toEqual({
      kind: 'waiting',
    });
    expect(pollApproval).toHaveBeenCalledWith('pairing-1', REQUEST);
  });

  it('listPairingRequests() forwards the engine result unchanged', async () => {
    const engine = fakeControlSurface({
      listPairingRequests: vi.fn().mockResolvedValue([REQUEST]),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.listPairingRequests()).resolves.toEqual([REQUEST]);
  });

  it('listPairingRequests() answers [] and logs, never throwing, when the engine rejects', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const engine = fakeControlSurface({
      listPairingRequests: vi.fn().mockRejectedValue(new Error('relay unreachable')),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.listPairingRequests()).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('commitPairing() forwards the id and the engine result unchanged', async () => {
    const commitPairing = vi.fn().mockResolvedValue({ pending: true });
    const engine = fakeControlSurface({ commitPairing });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.commitPairing('pairing-1')).resolves.toEqual({ pending: true });
    expect(commitPairing).toHaveBeenCalledWith('pairing-1');
  });

  it('commitPairing() answers null and logs, never throwing, when the engine rejects', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const engine = fakeControlSurface({
      commitPairing: vi.fn().mockRejectedValue(new Error('relay unreachable')),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.commitPairing('pairing-1')).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('approvePairing() forwards the id and the engine result unchanged', async () => {
    const approvePairing = vi.fn().mockResolvedValue(true);
    const engine = fakeControlSurface({ approvePairing });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.approvePairing('pairing-1')).resolves.toBe(true);
    expect(approvePairing).toHaveBeenCalledWith('pairing-1');
  });

  it('approvePairing() answers false and logs, never throwing, when the engine rejects', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const engine = fakeControlSurface({
      approvePairing: vi.fn().mockRejectedValue(new Error('relay unreachable')),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.approvePairing('pairing-1')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('denyPairing() forwards the id to the engine and resolves', async () => {
    const denyPairing = vi.fn().mockResolvedValue(undefined);
    const engine = fakeControlSurface({ denyPairing });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.denyPairing('pairing-1')).resolves.toBeUndefined();
    expect(denyPairing).toHaveBeenCalledWith('pairing-1');
  });

  it('denyPairing() never throws and only logs when the engine rejects', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const engine = fakeControlSurface({
      denyPairing: vi.fn().mockRejectedValue(new Error('relay unreachable')),
    });
    const { controller } = buildDirectSyncController<SyncEngineControlSurface>({
      baseUrl: BASE_URL,
      keyStore: new FakeKvStore(),
      oauthDriver: unusedDriver(),
      buildEngine: () => engine,
    });

    await expect(controller.denyPairing('pairing-1')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
