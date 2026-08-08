import { logger } from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import {
  RecoveryCodeError,
  RecoveryCodeRequiredError,
  type SyncStatus,
} from '@cuewise/sync-engine';
import { fakeControlSurface } from '@cuewise/sync-engine/src/__fixtures__/fake-control-surface';
import { describe, expect, it, vi } from 'vitest';
import { handleSyncControlMessage, type SyncControlDeps } from './handle-sync-control-message';
import { isSyncControlMessage, type SyncControlMessage } from './sync-control-messages';

describe('handleSyncControlMessage: details', () => {
  it('maps the engine account + lastSyncedAt into a details response', async () => {
    const engine = fakeControlSurface({
      getAccount: vi.fn().mockResolvedValue({ userId: 'u1', email: 'kes@example.com' }),
      getLastSyncedAt: vi.fn().mockReturnValue(1_700_000_000_000),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'details' },
      fakeDeps()
    );

    expect(result).toEqual({
      ok: true,
      kind: 'details',
      details: {
        accountEmail: 'kes@example.com',
        accountId: 'u1',
        lastSyncedAt: 1_700_000_000_000,
        recoveryEnvelope: 'present',
      },
    });
  });

  it('refreshes the recovery envelope when the caller asks for it', async () => {
    // ENG-98 moved the check off the worker's pull loop onto this lookup, and the settings panel
    // is the caller that sets the flag — it is the one surface that renders the finding.
    const refreshRecoveryEnvelope = vi.fn().mockResolvedValue('missing');
    const engine = fakeControlSurface({
      getAccount: vi.fn().mockResolvedValue({ userId: 'u1', email: null }),
      getRecoveryEnvelope: vi.fn().mockReturnValue('present'),
      refreshRecoveryEnvelope,
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'details', refreshRecoveryEnvelope: true },
      fakeDeps()
    );

    expect(refreshRecoveryEnvelope).toHaveBeenCalled();
    expect(result).toMatchObject({ details: { recoveryEnvelope: 'missing' } });
  });

  it('reports the recorded answer without asking the server when the flag is absent', async () => {
    // The quick-menu footer shows the identity and nothing else, so it must not buy a request for
    // a finding it never renders — the waste ENG-98 is about, in miniature.
    const refreshRecoveryEnvelope = vi.fn().mockResolvedValue('missing');
    const engine = fakeControlSurface({
      getAccount: vi.fn().mockResolvedValue({ userId: 'u1', email: null }),
      getRecoveryEnvelope: vi.fn().mockReturnValue('present'),
      refreshRecoveryEnvelope,
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'details' },
      fakeDeps()
    );

    expect(refreshRecoveryEnvelope).not.toHaveBeenCalled();
    expect(result).toMatchObject({ details: { recoveryEnvelope: 'present' } });
  });

  it('answers details null when the engine has no account', async () => {
    const result = await handleSyncControlMessage(
      fakeControlSurface(),
      { kind: 'cuewise-sync-control', op: 'details' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: true, kind: 'details', details: null });
  });
});

describe('handleSyncControlMessage: getLastCycle', () => {
  it("maps the engine's last cycle into an outcome response", async () => {
    const engine = fakeControlSurface({
      getLastCycle: vi.fn().mockReturnValue({
        known: true,
        cycle: { at: 1_700_000_000_000, outcome: { kind: 'no-key' } },
      }),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'getLastCycle' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: true, kind: 'lastCycle', outcome: { kind: 'no-key' } });
  });

  it('answers a failure when the engine cannot read its record, never a null outcome', async () => {
    // A null outcome means "no cycle has run" and clears the panel's badge; an unreadable record
    // must instead reach the bridge as a failure it turns into LAST_CYCLE_UNAVAILABLE.
    const engine = fakeControlSurface({
      getLastCycle: vi.fn().mockReturnValue({ known: false }),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'getLastCycle' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: false, reason: 'error', detail: 'last cycle unreadable' });
  });

  it('awaits hydration before reading, so a cold worker cannot answer "no cycle" early', async () => {
    // The listeners are registered synchronously while start() waits on the settings migration,
    // so without this the first read after a teardown reports no cycle for a failing device.
    const order: string[] = [];
    const engine = fakeControlSurface({
      ensureHydrated: vi.fn(async () => {
        // Yield first, or the push lands synchronously and a caller that never awaits still
        // produces this order — the assertion would pass against the very bug it guards.
        await Promise.resolve();
        order.push('hydrate');
      }),
      getLastCycle: vi.fn(() => {
        order.push('read');
        return { known: true, cycle: null };
      }),
    });

    await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'getLastCycle' },
      fakeDeps()
    );

    expect(order).toEqual(['hydrate', 'read']);
  });

  it('awaits hydration for details too, since it owns the last-synced stamp', async () => {
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

    await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'details' },
      fakeDeps()
    );

    expect(order).toEqual(['hydrate', 'read']);
  });

  it('answers a null outcome when the engine has not run a cycle yet', async () => {
    const result = await handleSyncControlMessage(
      fakeControlSurface(),
      { kind: 'cuewise-sync-control', op: 'getLastCycle' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: true, kind: 'lastCycle', outcome: null });
  });
});

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
  it('routes syncNow to engine.syncNow and responds with its outcome', async () => {
    const engine = fakeControlSurface();
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'syncNow' },
      deps
    );

    expect(engine.syncNow).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, kind: 'outcome', outcome: { kind: 'synced' } });
  });

  it('carries the engine outcome through the round trip unchanged', async () => {
    const engine = fakeControlSurface({ syncNow: vi.fn().mockResolvedValue({ kind: 'resynced' }) });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'syncNow' },
      deps
    );

    expect(result).toEqual({ ok: true, kind: 'outcome', outcome: { kind: 'resynced' } });
  });

  it('routes disable to engine.disableSync and responds ok', async () => {
    const engine = fakeControlSurface();
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
    const engine = fakeControlSurface();
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
    const engine = fakeControlSurface();
    const deps = fakeDeps();

    await handleSyncControlMessage(
      engine,
      enableMessage({ recoveryCode: 'CW1-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA' }),
      deps
    );

    expect(engine.enableSync).toHaveBeenCalledWith('dev', 'cred-a', 'Device A', {
      recoveryCode: 'CW1-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA',
    });
  });

  it('returns the one-shot recovery code from deps on success', async () => {
    const engine = fakeControlSurface();
    const deps = fakeDeps({
      takeRecoveryCode: vi.fn().mockReturnValue('CW1-BBBBB-BBBBB-BBBBB-BBBBB-BBBBB-BBBBB'),
    });

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: true, recoveryCode: 'CW1-BBBBB-BBBBB-BBBBB-BBBBB-BBBBB-BBBBB' });
  });

  // enableSync hands a minted code over before the steps that can throw, and the account it opens
  // outlives the attempt — a failure that swallows it locks the user out for good.
  it.each([
    ['a generic fault', new Error('storage unreachable'), { reason: 'error' }],
    ['a 401 after the mint', new ApiError('invalid_token', 401), { reason: 'auth' }],
  ])('surfaces a minted code when the enable fails with %s', async (_name, thrown, expected) => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const engine = fakeControlSurface({ enableSync: vi.fn().mockRejectedValue(thrown) });
    const deps = fakeDeps({
      takeRecoveryCode: vi
        .fn()
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce('CW1-MINTED-BEFORE-THE-THROW'),
    });

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toMatchObject({ ok: false, ...expected });
    expect(result).toHaveProperty('recoveryCode', 'CW1-MINTED-BEFORE-THE-THROW');
  });

  it('drains the capture slot before calling enableSync so a stale code never leaks', async () => {
    const engine = fakeControlSurface();
    const takeRecoveryCode = vi.fn().mockReturnValueOnce('stale').mockReturnValueOnce(undefined);
    const deps = fakeDeps({ takeRecoveryCode });

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(takeRecoveryCode).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, recoveryCode: undefined });
  });

  it('returns an error result without calling the engine when provider is missing', async () => {
    const engine = fakeControlSurface();
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
    const engine = fakeControlSurface();
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
    const engine = fakeControlSurface();
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
    const engine = fakeControlSurface();
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage({ credential: '' }), deps);

    expect(engine.enableSync).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('calls engine.enableSync with provider "google" and the id-token credential', async () => {
    const engine = fakeControlSurface();
    const deps = fakeDeps();

    await handleSyncControlMessage(
      engine,
      enableMessage({ provider: 'google', credential: 'fake.jwt.token' }),
      deps
    );

    expect(engine.enableSync).toHaveBeenCalledWith('google', 'fake.jwt.token', 'Device A', {
      recoveryCode: undefined,
    });
  });

  it('maps a thrown RecoveryCodeRequiredError to needs-code', async () => {
    const engine = fakeControlSurface({
      enableSync: vi.fn().mockRejectedValue(new RecoveryCodeRequiredError()),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'needs-code' });
  });

  it('maps a thrown RecoveryCodeError(format) to bad-code with detail "format"', async () => {
    const engine = fakeControlSurface({
      enableSync: vi.fn().mockRejectedValue(new RecoveryCodeError('format', 'bad format')),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'bad-code', detail: 'format' });
  });

  it('maps a thrown RecoveryCodeError(checksum) to bad-code with detail "checksum"', async () => {
    const engine = fakeControlSurface({
      enableSync: vi.fn().mockRejectedValue(new RecoveryCodeError('checksum', 'bad checksum')),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'bad-code', detail: 'checksum' });
  });

  it('maps a thrown RecoveryCodeError(version) to bad-code with detail "version"', async () => {
    const engine = fakeControlSurface({
      enableSync: vi
        .fn()
        .mockRejectedValue(new RecoveryCodeError('version', 'unsupported version')),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'bad-code', detail: 'version' });
  });

  it('maps a thrown ApiError(401) to auth', async () => {
    const engine = fakeControlSurface({
      enableSync: vi.fn().mockRejectedValue(new ApiError('invalid_token', 401)),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'auth' });
  });

  it('maps a post-call signed_out status (no throw) to auth', async () => {
    const engine = fakeControlSurface({
      getStatus: vi.fn().mockReturnValue('signed_out' as SyncStatus),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'auth' });
  });

  it('lets a disable reach the engine while an enable is still in flight', async () => {
    // Queued behind it, the disconnect could only land once the enable had finished — so the
    // engine's cancellation would never see it, and the panel would have handed Chrome sync off
    // for an account the user had already disconnected.
    let releaseEnable = () => {};
    const parked = new Promise<void>((resolve) => {
      releaseEnable = resolve;
    });
    const disableSync = vi.fn().mockResolvedValue(undefined);
    const engine = fakeControlSurface({
      enableSync: vi.fn().mockImplementation(() => parked),
      disableSync,
    });
    const deps = fakeDeps();

    const enabling = handleSyncControlMessage(engine, enableMessage(), deps);
    const disabling = handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'disable' },
      deps
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Read and released before asserting: the mutex is module-scoped, so a throw here would
    // strand the parked enable and time out every later test in the file.
    const reachedEngine = disableSync.mock.calls.length;
    releaseEnable();
    await Promise.all([enabling, disabling]);

    expect(reachedEngine).toBe(1);
  });

  it('maps a post-call disabled status to a quiet cancel, never to ok', async () => {
    const engine = fakeControlSurface({
      getStatus: vi.fn().mockReturnValue('disabled' as SyncStatus),
    });
    // Read-and-clear, like background.ts's slot: the drain at the top of doEnable must not be
    // what reaches the user, or a previous attempt's code would open a different account.
    const deps = fakeDeps({
      takeRecoveryCode: vi.fn().mockReturnValueOnce(undefined).mockReturnValueOnce('CW1-ABC'),
    });

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'cancelled', recoveryCode: 'CW1-ABC' });
  });

  it('maps any other thrown error to error with its message as detail', async () => {
    const engine = fakeControlSurface({
      enableSync: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const deps = fakeDeps();

    const result = await handleSyncControlMessage(engine, enableMessage(), deps);

    expect(result).toEqual({ ok: false, reason: 'error', detail: 'boom' });
  });
});

describe('handleSyncControlMessage: reconnect', () => {
  it('calls engine.enableSync with the persisted creds and no recovery code', async () => {
    const engine = fakeControlSurface();
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

    expect(engine.enableSync).toHaveBeenCalledWith('dev', 'cred-a', 'Device A', {
      recoveryCode: undefined,
    });
  });

  it('returns an error result without calling the engine when creds are absent', async () => {
    const engine = fakeControlSurface();
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
    const engine = fakeControlSurface({
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
    const engine = fakeControlSurface({
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
    const engine = fakeControlSurface({
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
    const engine = fakeControlSurface({
      syncNow: vi.fn().mockRejectedValue(new Error('boom')),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'syncNow' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: false, reason: 'error', detail: 'boom' });
  });

  it('names the cause in detail even when the throw was not an Error', async () => {
    // The page realm only ever sees `detail`; the raw value stays in the worker's own console.
    const engine = fakeControlSurface({
      syncNow: vi.fn().mockRejectedValue('worker went away'),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'syncNow' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: false, reason: 'error', detail: 'worker went away' });
  });

  it('still answers the page when the thrown value cannot be coerced to a string', async () => {
    // A null-prototype object has no toString, so coercing one INSIDE the catch throws and the
    // router would answer nothing at all — the page's send hangs to its timeout for no reason.
    const engine = fakeControlSurface({
      syncNow: vi.fn().mockRejectedValue(Object.create(null)),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'syncNow' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: false, reason: 'error', detail: '[unstringifiable value]' });
  });

  it('still answers the page when an enable throws a value that cannot be coerced', async () => {
    const engine = fakeControlSurface({
      enableSync: vi.fn().mockRejectedValue(Object.create(null)),
    });

    const result = await handleSyncControlMessage(engine, enableMessage(), fakeDeps());

    expect(result).toEqual({ ok: false, reason: 'error', detail: '[unstringifiable value]' });
  });
});

describe('handleSyncControlMessage: concurrency', () => {
  it('serializes two concurrent enable calls so they never interleave', async () => {
    const events: string[] = [];
    let resolveFirst: (() => void) | undefined;
    const engine = fakeControlSurface({
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

describe('handleSyncControlMessage: sessions', () => {
  const session = {
    id: 's1',
    deviceName: 'laptop',
    createdAt: 1,
    lastUsedAt: 2,
    current: true,
  };

  it('answers listSessions with the sessions kind', async () => {
    const engine = fakeControlSurface({
      listSessions: vi.fn().mockResolvedValue([session]),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'listSessions' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: true, kind: 'sessions', sessions: [session] });
  });

  it('forwards an unreadable list as null rather than an empty array', async () => {
    const engine = fakeControlSurface({ listSessions: vi.fn().mockResolvedValue(null) });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'listSessions' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: true, kind: 'sessions', sessions: null });
  });

  it('forwards a revoke and answers ok', async () => {
    const revokeSession = vi.fn().mockResolvedValue(undefined);
    const engine = fakeControlSurface({ revokeSession });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'revokeSession', sessionId: 's2' },
      fakeDeps()
    );

    expect(revokeSession).toHaveBeenCalledWith('s2');
    expect(result).toEqual({ ok: true });
  });

  it('answers a failed revoke with a serialisable failure, not a thrown Error', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const engine = fakeControlSurface({
      revokeSession: vi.fn().mockRejectedValue(new ApiError('not_found', 404)),
    });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'revokeSession', sessionId: 'gone' },
      fakeDeps()
    );

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe('error');
    }
  });

  it('rejects a revoke with no session id rather than forwarding it', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const revokeSession = vi.fn().mockResolvedValue(undefined);
    const engine = fakeControlSurface({ revokeSession });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'revokeSession' },
      fakeDeps()
    );

    expect(revokeSession).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('forwards a rename with both fields', async () => {
    const renameSession = vi.fn().mockResolvedValue(undefined);
    const engine = fakeControlSurface({ renameSession });

    const result = await handleSyncControlMessage(
      engine,
      {
        kind: 'cuewise-sync-control',
        op: 'renameSession',
        sessionId: 's1',
        deviceName: 'Work MacBook',
      },
      fakeDeps()
    );

    expect(renameSession).toHaveBeenCalledWith('s1', 'Work MacBook');
    expect(result).toEqual({ ok: true });
  });

  it('answers revokeOtherSessions with the count', async () => {
    const engine = fakeControlSurface({ revokeOtherSessions: vi.fn().mockResolvedValue(3) });

    const result = await handleSyncControlMessage(
      engine,
      { kind: 'cuewise-sync-control', op: 'revokeOtherSessions' },
      fakeDeps()
    );

    expect(result).toEqual({ ok: true, kind: 'revokedCount', revoked: 3 });
  });
});
