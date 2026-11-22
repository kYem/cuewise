import { LAST_SYNC_CREDS_KEY } from '@cuewise/app';
import type { SyncSession } from '@cuewise/shared';
import type {
  PairingCommitment,
  PendingPairing,
  SyncEngineControlSurface,
} from '@cuewise/sync-engine';
import { fakeControlSurface } from '@cuewise/sync-engine/src/__fixtures__/fake-control-surface';
import { describe, expect, it, vi } from 'vitest';
import { connectPageToWorker, GOOGLE_ID_TOKEN } from './__fixtures__/sync-control-wire.fixtures';
import { BridgeSyncController } from './bridge-sync-controller';
import type { SyncControlDeps } from './handle-sync-control-message';
import { SYNC_CONTROL_OPS, type SyncControlOp } from './sync-control-messages';

const CAPTURED_CODE = 'CW1-CAPTD-00000-00000-00000-00000-00000';
const TYPED_CODE = 'CW1-TYPED-00000-00000-00000-00000-00000';
const LAST_SYNCED_AT = 1_700_000_000_000;

const SESSION: SyncSession = {
  id: 's2',
  deviceName: 'Phone',
  createdAt: 1,
  lastUsedAt: 2,
  current: false,
};

const REQUEST: PendingPairing = {
  id: 'pairing-1',
  deviceName: 'Phone',
  requesterCommitment: 'commitment' as PairingCommitment,
  requesterPublicKey: null,
  requesterNonce: null,
  createdAt: 1,
};

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
    call: (controller) => controller.enable('acct-1', 'Laptop'),
    returns: { ok: true, recoveryCode: CAPTURED_CODE },
    reaches: ['enableSync', 'dev', 'acct-1', 'Laptop', { recoveryCode: undefined }],
  },
  reconnect: {
    stored: {
      [LAST_SYNC_CREDS_KEY]: { provider: 'dev', accountId: 'acct-1', deviceName: 'Laptop' },
    },
    call: (controller) => controller.reconnect('Laptop', TYPED_CODE),
    returns: { ok: true, recoveryCode: CAPTURED_CODE },
    reaches: ['enableSync', 'dev', 'acct-1', 'Laptop', { recoveryCode: TYPED_CODE }],
  },
  disable: {
    call: (controller) => controller.disable(),
    returns: undefined,
    reaches: ['disableSync'],
  },
  regenerate: {
    engine: { regenerateRecoveryCode: async () => CAPTURED_CODE },
    call: (controller) => controller.regenerateRecoveryCode(),
    returns: CAPTURED_CODE,
    reaches: ['regenerateRecoveryCode'],
  },
  syncNow: {
    engine: { syncNow: async () => ({ kind: 'resynced' }) },
    call: (controller) => controller.syncNow(),
    returns: { kind: 'resynced' },
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
    engine: { beginPairing: async () => ({ pairingId: REQUEST.id }) },
    call: (controller) => controller.beginPairing(),
    returns: { pairingId: REQUEST.id },
    reaches: ['beginPairing'],
  },
  pollPairing: {
    engine: { pollPairing: async () => ({ kind: 'confirm', sas: '123 456' }) },
    call: (controller) => controller.pollPairing(),
    returns: { kind: 'confirm', sas: '123 456' },
    reaches: ['pollPairing'],
  },
  listPairingRequests: {
    engine: { listPairingRequests: async () => [REQUEST] },
    call: (controller) => controller.listPairingRequests(),
    returns: [REQUEST],
    reaches: ['listPairingRequests'],
  },
  commitPairing: {
    engine: { commitPairing: async () => ({ pending: true }) },
    call: (controller) => controller.commitPairing(REQUEST.id),
    returns: { pending: true },
    reaches: ['commitPairing', REQUEST.id],
  },
  pollApproval: {
    engine: { pollApproval: async () => ({ kind: 'confirm', sas: '123 456' }) },
    call: (controller) => controller.pollApproval(REQUEST.id, REQUEST),
    returns: { kind: 'confirm', sas: '123 456' },
    reaches: ['pollApproval', REQUEST.id, REQUEST],
  },
  approvePairing: {
    engine: { approvePairing: async () => true },
    call: (controller) => controller.approvePairing(REQUEST.id),
    returns: true,
    reaches: ['approvePairing', REQUEST.id],
  },
  denyPairing: {
    call: (controller) => controller.denyPairing(REQUEST.id),
    returns: undefined,
    reaches: ['denyPairing', REQUEST.id],
  },
};

// The worker's one-shot capture slot: drained before an enable, then holding the code it minted.
function workerDeps(): SyncControlDeps {
  return {
    takeRecoveryCode: vi.fn().mockReturnValueOnce(undefined).mockReturnValue(CAPTURED_CODE),
  };
}

describe('sync control wire: bridge to handler', () => {
  it.each(SYNC_CONTROL_OPS)('%s reaches the engine and answers the caller', async (op) => {
    const wireCase = WIRE_CASES[op];
    const [method, ...args] = wireCase.reaches;
    const engine = fakeControlSurface(wireCase.engine);
    const reached = vi.spyOn(engine, method);
    const stored = connectPageToWorker(engine, workerDeps());
    Object.assign(stored.data, wireCase.stored);

    const answer = await wireCase.call(new BridgeSyncController());

    expect(answer).toEqual(wireCase.returns);
    expect(reached).toHaveBeenCalledWith(...args);
  });

  it('a Google sign-in reaches the engine as the google provider', async () => {
    const engine = fakeControlSurface();
    connectPageToWorker(engine, workerDeps());

    await new BridgeSyncController({ googleClientId: 'client-id' }).enableWithGoogle('Laptop');

    expect(engine.enableSync).toHaveBeenCalledWith('google', GOOGLE_ID_TOKEN, 'Laptop', {
      recoveryCode: undefined,
    });
  });
});
