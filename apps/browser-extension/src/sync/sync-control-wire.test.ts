import { LAST_SYNC_CREDS_KEY, type LastSyncCreds } from '@cuewise/app';
import { logger } from '@cuewise/shared';
import { ApiError } from '@cuewise/sync-client';
import type { SyncEngineControlSurface } from '@cuewise/sync-engine';
import { fakeControlSurface } from '@cuewise/sync-engine/src/__fixtures__/fake-control-surface';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURED_CODE,
  connectPageToWorker,
  GOOGLE_ID_TOKEN,
  PAIRING_REQUEST,
  REGENERATED_CODE,
  SESSION,
  TYPED_CODE,
} from './__fixtures__/sync-control-wire.fixtures';
import { BridgeSyncController } from './bridge-sync-controller';
import { SYNC_CONTROL_OPS, type SyncControlOp } from './sync-control-messages';

const LAST_SYNCED_AT = 1_700_000_000_000;
const SAVED_SIGN_IN: LastSyncCreds = { provider: 'dev', accountId: 'acct-1', deviceName: 'Laptop' };

interface WireCase {
  /** Answers no bridge fallback produces, so a response the bridge swallowed cannot pass. */
  engine?: Partial<SyncEngineControlSurface>;
  stored?: Record<string, unknown>;
  call: (controller: BridgeSyncController) => Promise<unknown>;
  returns: unknown;
  reaches: [method: keyof SyncEngineControlSurface, ...args: unknown[]];
}

// Keyed by op, so one added to SYNC_CONTROL_OPS without a case here stops compiling.
const WIRE_CASES: Record<SyncControlOp, WireCase> = {
  enable: {
    call: (controller) => controller.enable('acct-1', 'Laptop', TYPED_CODE),
    returns: { ok: true, recoveryCode: CAPTURED_CODE },
    reaches: ['enableSync', 'dev', 'acct-1', 'Laptop', { recoveryCode: TYPED_CODE }],
  },
  reconnect: {
    stored: { [LAST_SYNC_CREDS_KEY]: SAVED_SIGN_IN },
    call: (controller) => controller.reconnect('Unsaved name', TYPED_CODE),
    returns: { ok: true, recoveryCode: CAPTURED_CODE },
    reaches: ['enableSync', 'dev', 'acct-1', 'Laptop', { recoveryCode: TYPED_CODE }],
  },
  disable: {
    call: (controller) => controller.disable(),
    returns: undefined,
    reaches: ['disableSync'],
  },
  regenerate: {
    engine: { regenerateRecoveryCode: async () => REGENERATED_CODE },
    call: (controller) => controller.regenerateRecoveryCode(),
    returns: REGENERATED_CODE,
    reaches: ['regenerateRecoveryCode'],
  },
  syncNow: {
    engine: { syncNow: async () => ({ kind: 'failed', reason: 'network', error: 'offline' }) },
    call: (controller) => controller.syncNow(),
    returns: { kind: 'failed', reason: 'network', error: 'offline' },
    reaches: ['syncNow'],
  },
  details: {
    engine: {
      getAccount: async () => ({ userId: 'u-1', email: 'user@example.com' }),
      getLastSyncedAt: () => LAST_SYNCED_AT,
      refreshRecoveryEnvelope: async () => 'missing',
    },
    call: (controller) => controller.getDetails({ refreshRecoveryEnvelope: true }),
    returns: {
      accountEmail: 'user@example.com',
      accountId: 'u-1',
      lastSyncedAt: LAST_SYNCED_AT,
      recoveryEnvelope: 'missing',
    },
    reaches: ['refreshRecoveryEnvelope'],
  },
  getLastCycle: {
    engine: {
      getLastCycle: () => ({ known: true, cycle: { at: 1, outcome: { kind: 'resynced' } } }),
    },
    call: (controller) => controller.getLastCycle(),
    returns: { available: true, outcome: { kind: 'resynced' } },
    reaches: ['getLastCycle'],
  },
  listSessions: {
    engine: { listSessions: async () => [SESSION] },
    call: (controller) => controller.listSessions(),
    returns: [SESSION],
    reaches: ['listSessions'],
  },
  revokeSession: {
    call: (controller) => controller.revokeSession(SESSION.id),
    returns: undefined,
    reaches: ['revokeSession', SESSION.id],
  },
  renameSession: {
    call: (controller) => controller.renameSession(SESSION.id, 'Work phone'),
    returns: undefined,
    reaches: ['renameSession', SESSION.id, 'Work phone'],
  },
  revokeOtherSessions: {
    engine: { revokeOtherSessions: async () => 3 },
    call: (controller) => controller.revokeOtherSessions(),
    returns: 3,
    reaches: ['revokeOtherSessions'],
  },
  deleteAccount: {
    engine: { deleteAccount: async () => ({ ok: false, reason: 'auth' }) },
    call: (controller) => controller.deleteAccount(),
    returns: { ok: false, reason: 'auth' },
    reaches: ['deleteAccount'],
  },
  beginPairing: {
    engine: { beginPairing: async () => ({ pairingId: PAIRING_REQUEST.id }) },
    call: (controller) => controller.beginPairing(),
    returns: { pairingId: PAIRING_REQUEST.id },
    reaches: ['beginPairing'],
  },
  pollPairing: {
    engine: { pollPairing: async () => ({ kind: 'confirm', sas: '123 456' }) },
    call: (controller) => controller.pollPairing(),
    returns: { kind: 'confirm', sas: '123 456' },
    reaches: ['pollPairing'],
  },
  listPairingRequests: {
    engine: { listPairingRequests: async () => [PAIRING_REQUEST] },
    call: (controller) => controller.listPairingRequests(),
    returns: [PAIRING_REQUEST],
    reaches: ['listPairingRequests'],
  },
  commitPairing: {
    engine: { commitPairing: async () => ({ pending: true }) },
    call: (controller) => controller.commitPairing(PAIRING_REQUEST.id),
    returns: { pending: true },
    reaches: ['commitPairing', PAIRING_REQUEST.id],
  },
  pollApproval: {
    engine: { pollApproval: async () => ({ kind: 'confirm', sas: '123 456' }) },
    call: (controller) => controller.pollApproval(PAIRING_REQUEST.id, PAIRING_REQUEST),
    returns: { kind: 'confirm', sas: '123 456' },
    reaches: ['pollApproval', PAIRING_REQUEST.id, PAIRING_REQUEST],
  },
  approvePairing: {
    engine: { approvePairing: async () => true },
    call: (controller) => controller.approvePairing(PAIRING_REQUEST.id),
    returns: true,
    reaches: ['approvePairing', PAIRING_REQUEST.id],
  },
  denyPairing: {
    call: (controller) => controller.denyPairing(PAIRING_REQUEST.id),
    returns: undefined,
    reaches: ['denyPairing', PAIRING_REQUEST.id],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sync control wire: bridge to handler', () => {
  it.each(SYNC_CONTROL_OPS)('%s reaches the engine and answers the caller', async (op) => {
    const wireCase = WIRE_CASES[op];
    const [method, ...args] = wireCase.reaches;
    const engine = fakeControlSurface(wireCase.engine);
    const reached = vi.spyOn(engine, method);
    // denyPairing's fallback answers undefined as well, so this log is all that tells them apart.
    const gaveUp = vi.spyOn(logger, 'error');
    connectPageToWorker(engine);
    await chrome.storage.local.set(wireCase.stored ?? {});

    const answer = await wireCase.call(new BridgeSyncController());

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ op }));
    expect(reached).toHaveBeenCalledWith(...args);
    expect(answer).toEqual(wireCase.returns);
    expect(gaveUp).not.toHaveBeenCalled();
  });

  it('a Google sign-in reaches the engine as the google provider', async () => {
    const engine = fakeControlSurface();
    connectPageToWorker(engine);

    const controller = new BridgeSyncController({ googleClientId: 'client-id' });
    await controller.enableWithGoogle('Laptop', TYPED_CODE);

    expect(engine.enableSync).toHaveBeenCalledWith('google', GOOGLE_ID_TOKEN, 'Laptop', {
      recoveryCode: TYPED_CODE,
    });
  });

  it('a failed enable still hands back the recovery code it minted', async () => {
    const engine = fakeControlSurface({
      enableSync: async () => {
        throw new ApiError('invalid_token', 401);
      },
    });
    connectPageToWorker(engine);

    const answer = await new BridgeSyncController().enable('acct-1', 'Laptop');

    expect(answer).toEqual({ ok: false, reason: 'auth', recoveryCode: CAPTURED_CODE });
  });

  it('a cached details read answers from the recorded account', async () => {
    const engine = fakeControlSurface({
      getCachedAccount: () => ({ userId: 'recorded', email: null }),
      getAccount: async () => ({ userId: 'fetched', email: null }),
    });
    connectPageToWorker(engine);

    const details = await new BridgeSyncController().getDetails({ cached: true });

    expect(details).toMatchObject({ accountId: 'recorded' });
  });
});
