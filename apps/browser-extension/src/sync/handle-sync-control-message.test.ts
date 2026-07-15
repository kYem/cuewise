import { ApiError } from '@cuewise/sync-client';
import {
  RecoveryCodeError,
  RecoveryCodeRequiredError,
  type SyncEngineControlSurface,
  type SyncStatus,
} from '@cuewise/sync-engine';
import { describe, expect, it, vi } from 'vitest';
import { handleSyncControlMessage, type SyncControlDeps } from './handle-sync-control-message';
import { isSyncControlMessage, type SyncControlMessage } from './sync-control-messages';

function fakeEngine(overrides: Partial<SyncEngineControlSurface> = {}): SyncEngineControlSurface {
  return {
    enableSync: vi.fn().mockResolvedValue(undefined),
    disableSync: vi.fn().mockResolvedValue(undefined),
    syncNow: vi.fn().mockResolvedValue(undefined),
    regenerateRecoveryCode: vi.fn().mockResolvedValue('CW1-NEW00-00000-00000-00000-00000-00000'),
    getStatus: vi.fn().mockReturnValue('active' as SyncStatus),
    ...overrides,
  };
}

function fakeDeps(overrides: Partial<SyncControlDeps> = {}): SyncControlDeps {
  return {
    takeRecoveryCode: vi.fn().mockReturnValue(undefined),
    ...overrides,
  };
}

function enableMessage(overrides: Partial<SyncControlMessage> = {}): SyncControlMessage {
  return {
    kind: 'cuewise-sync-control',
    op: 'enable',
    provider: 'dev',
    credential: 'cred-a',
    deviceName: 'Device A',
    ...overrides,
  };
}

describe('handleSyncControlMessage: routing', () => {
  it('routes syncNow to engine.syncNow and responds ok', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'syncNow' },
      deps
    );

    expect(engine.syncNow).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true });
  });

  it('routes disable to engine.disableSync and responds ok', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'disable' },
      deps
    );

    expect(engine.disableSync).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true });
  });

  it('routes regenerate to engine.regenerateRecoveryCode and returns the new code', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'regenerate' },
      deps
    );

    expect(engine.regenerateRecoveryCode).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, recoveryCode: 'CW1-NEW00-00000-00000-00000-00000-00000' });
  });
});

describe('handleSyncControlMessage: enable', () => {
  it('calls engine.enableSync with the message credential/deviceName/recoveryCode', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    await handleSyncControlMessage(
      engine,
      enableMessage({ recoveryCode: 'CW1-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA' }),
      deps
    );

    expect(engine.enableSync).toHaveBeenCalledWith(
      'dev',
      'cred-a',
      'Device A',
      'CW1-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA'
    );
  });

  it('returns the one-shot recovery code from deps on success', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps({
      takeRecoveryCode: vi.fn().mockReturnValue('CW1-BBBBB-BBBBB-BBBBB-BBBBB-BBBBB-BBBBB'),
    });

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: true, recoveryCode: 'CW1-BBBBB-BBBBB-BBBBB-BBBBB-BBBBB-BBBBB' });
  });

  it('drains the capture slot before calling enableSync so a stale code never leaks', async () => {
    const engine = fakeEngine();
    const takeRecoveryCode = vi.fn().mockReturnValueOnce('stale').mockReturnValueOnce(undefined);
    const deps = fakeDeps({ takeRecoveryCode });

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(takeRecoveryCode).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, recoveryCode: undefined });
  });

  it('returns an error result without calling the engine when provider is missing', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(
      engine,
      enableMessage({ provider: undefined }),
      deps
    );

    expect(engine.enableSync).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('returns an error result without calling the engine when credential is missing', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(
      engine,
      enableMessage({ credential: undefined }),
      deps
    );

    expect(engine.enableSync).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('returns an error result without calling the engine when deviceName is missing', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(
      engine,
      enableMessage({ deviceName: undefined }),
      deps
    );

    expect(engine.enableSync).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('returns an error result without calling the engine when credential is an empty string', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage({ credential: '' }), deps);

    expect(engine.enableSync).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('calls engine.enableSync with provider "google" and the id-token credential', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    await handleSyncControlMessage(
      engine,
      enableMessage({ provider: 'google', credential: 'fake.jwt.token' }),
      deps
    );

    expect(engine.enableSync).toHaveBeenCalledWith(
      'google',
      'fake.jwt.token',
      'Device A',
      undefined
    );
  });

  it('maps a thrown RecoveryCodeRequiredError to needs-code', async () => {
    const engine = fakeEngine({
      enableSync: vi.fn().mockRejectedValue(new RecoveryCodeRequiredError()),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'needs-code' });
  });

  it('maps a thrown RecoveryCodeError(format) to bad-code with detail "format"', async () => {
    const engine = fakeEngine({
      enableSync: vi.fn().mockRejectedValue(new RecoveryCodeError('format', 'bad format')),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'bad-code', detail: 'format' });
  });

  it('maps a thrown RecoveryCodeError(checksum) to bad-code with detail "checksum"', async () => {
    const engine = fakeEngine({
      enableSync: vi.fn().mockRejectedValue(new RecoveryCodeError('checksum', 'bad checksum')),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'bad-code', detail: 'checksum' });
  });

  it('maps a thrown RecoveryCodeError(version) to bad-code with detail "version"', async () => {
    const engine = fakeEngine({
      enableSync: vi
        .fn()
        .mockRejectedValue(new RecoveryCodeError('version', 'unsupported version')),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'bad-code', detail: 'version' });
  });

  it('maps a thrown ApiError(401) to auth', async () => {
    const engine = fakeEngine({
      enableSync: vi.fn().mockRejectedValue(new ApiError('invalid_token', 401)),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'auth' });
  });

  it('maps a post-call signed_out status (no throw) to auth', async () => {
    const engine = fakeEngine({
      getStatus: vi.fn().mockReturnValue('signed_out' as SyncStatus),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'auth' });
  });

  it('maps any other thrown error to error with its message as detail', async () => {
    const engine = fakeEngine({
      enableSync: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'error', detail: 'boom' });
  });
});

describe('handleSyncControlMessage: reconnect', () => {
  it('calls engine.enableSync with the persisted creds and no recovery code', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    await handleSyncControlMessage(
      engine,
      {
        kind: 'cuewise-sync-control',
        op: 'reconnect',
        accountId: 'cred-a',
        deviceName: 'Device A',
      },
      deps
    );

    expect(engine.enableSync).toHaveBeenCalledWith('dev', 'cred-a', 'Device A', undefined);
  });

  it('returns an error result without calling the engine when creds are absent', async () => {
    const engine = fakeEngine();
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'reconnect' },
      deps
    );

    expect(engine.enableSync).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('maps a thrown ApiError(401) to auth, same as enable', async () => {
    const engine = fakeEngine({
      enableSync: vi.fn().mockRejectedValue(new ApiError('invalid_token', 401)),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(
      engine,
      {
        kind: 'cuewise-sync-control',
        op: 'reconnect',
        accountId: 'cred-a',
        deviceName: 'Device A',
      },
      deps
    );

    expect(result).toEqual({ ok: false, reason: 'auth' });
  });
});

describe('handleSyncControlMessage: op errors', () => {
  it('maps a thrown disableSync to an error result', async () => {
    const engine = fakeEngine({
      disableSync: vi.fn().mockRejectedValue(new Error('storage down')),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'disable' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: false, reason: 'error', detail: 'storage down' });
  });

  it('maps a thrown regenerateRecoveryCode to an error result', async () => {
    const engine = fakeEngine({
      regenerateRecoveryCode: vi.fn().mockRejectedValue(new Error('no session')),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'regenerate' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: false, reason: 'error', detail: 'no session' });
  });

  it('maps a thrown syncNow to an error result', async () => {
    const engine = fakeEngine({
      syncNow: vi.fn().mockRejectedValue(new Error('boom')),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'syncNow' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: false, reason: 'error', detail: 'boom' });
  });
});

describe('handleSyncControlMessage: concurrency', () => {
  it('serializes two concurrent enable calls so they never interleave', async () => {
    const events: string[] = [];
    let resolveFirst: (() => void) | undefined;
    const engine = fakeEngine({
      enableSync: vi.fn().mockImplementation(async (_provider: string, credential: string) => {
        events.push(`start-${credential}`);
        if (credential === 'cred-a') {
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
        }
        events.push(`end-${credential}`);
      }),
    });
    const deps = fakeDeps();

    const firstPromise = handleSyncControlMessage(
      engine,
      enableMessage({ credential: 'cred-a' }),
      deps
    );
    await Promise.resolve();
    await Promise.resolve();
    const secondPromise = handleSyncControlMessage(
      engine,
      enableMessage({ credential: 'cred-b' }),
      deps
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(['start-cred-a']);

    if (resolveFirst === undefined) {
      throw new Error('expected the first enableSync call to be pending');
    }
    resolveFirst();
    await Promise.all([firstPromise, secondPromise]);

    expect(events).toEqual(['start-cred-a', 'end-cred-a', 'start-cred-b', 'end-cred-b']);
  });
});

describe('isSyncControlMessage', () => {
  it('accepts a well-formed control message', () => {
    expect(isSyncControlMessage(enableMessage())).toBe(true);
  });

  it('rejects a message with the wrong kind', () => {
    expect(isSyncControlMessage({ kind: 'cuewise-sync-mutation', op: 'enable' })).toBe(false);
  });

  it('rejects a message with an unknown op', () => {
    expect(isSyncControlMessage({ kind: 'cuewise-sync-control', op: 'not-a-real-op' })).toBe(false);
  });

  it('rejects a non-object message (e.g. null or a primitive)', () => {
    expect(isSyncControlMessage(null)).toBe(false);
    expect(isSyncControlMessage('not-a-message')).toBe(false);
  });
});
