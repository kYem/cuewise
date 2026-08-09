import {
  b64urlDecode,
  b64urlEncode,
  type DataKey,
  derivePairingSas,
  generatePairingKeypair,
  wrapDataKeyToPeer,
  type X25519KeyPair,
} from '@cuewise/crypto';
import { configurePlatform } from '@cuewise/shared';
import { getGoals, setGoals } from '@cuewise/storage';
import { SessionManager, SYNC_SESSION_KEY } from '@cuewise/sync-client';
import { goalFactory } from '@cuewise/test-utils/factories';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeApiClient, FakeSyncServer, PAIRING_TTL_MS } from './__fixtures__/fake-api-client';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeScheduler } from './__fixtures__/fake-scheduler';
import { CLOUD_SYNC_ENABLED_KEY, SyncEngine } from './engine';
import { loadPersistedDataKey, RecoveryCodeRequiredError, SYNC_DATA_KEY } from './key-lifecycle';
import { SyncMetadataStore } from './metadata-store';

interface Device {
  kv: FakeKvStore;
  apiClient: FakeApiClient;
  scheduler: FakeScheduler;
  engine: SyncEngine;
}

// Every engine createDevice makes, so afterEach can stop() each one — a markMutated call under
// real timers arms a real 2s setTimeout, and nothing else in this file ever cancels it.
let devices: Device[] = [];

afterEach(async () => {
  await Promise.all(devices.map((device) => device.engine.stop().catch(() => {})));
  devices = [];
});

/** Builds one "device": its own storage/scheduler/session, sharing the given fake server. */
function createDevice(server: FakeSyncServer): Device {
  const kv = new FakeKvStore();
  const apiClient = new FakeApiClient(server);
  const scheduler = new FakeScheduler();
  const engine = new SyncEngine({
    apiClient,
    sessionManager: new SessionManager(kv),
    keyStore: kv,
    scheduler,
  });
  const device = { kv, apiClient, scheduler, engine };
  devices.push(device);
  return device;
}

/** A respawned worker: a fresh engine over the same device's storage and transport. */
function restart(device: Device): SyncEngine {
  const engine = new SyncEngine({
    apiClient: device.apiClient,
    sessionManager: new SessionManager(device.kv),
    keyStore: device.kv,
    scheduler: device.scheduler,
  });
  devices.push({ ...device, engine });
  return engine;
}

/** Points the shared @cuewise/storage helpers at this device's backend for the next await chain. */
function useStorage(device: Pick<Device, 'kv'>): void {
  configurePlatform({ storage: device.kv });
}

/** Forgets what this device already pulled, so the server's own records replay from seq 0. */
async function replayFromScratch(device: Pick<Device, 'kv'>): Promise<void> {
  const metaStore = new SyncMetadataStore(device.kv);
  const meta = await metaStore.load();
  meta.cursor = 0;
  meta.hlcs = {};
  await metaStore.save(meta);
  await setGoals([]);
}

/**
 * A promise the test settles by hand, plus `awaited`, which resolves once the code under test has
 * asked for it. Lets a test park one operation mid-flight and drive another past it.
 */
function heldAnswer(): { held: () => Promise<void>; release: () => void; awaited: Promise<void> } {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let start = (): void => {};
  const awaited = new Promise<void>((resolve) => {
    start = resolve;
  });
  return {
    held: async () => {
      start();
      await held;
    },
    release: () => release(),
    awaited,
  };
}

interface PairingFlow {
  server: FakeSyncServer;
  /** The requester: signed in, enrolled here once, and now without a data key. */
  requester: Device;
  /** A second live session on the same account — the approver's transport, driven by hand. */
  approver: FakeApiClient;
  dk: DataKey;
  keyId: string;
}

/** The approver's half after it has committed: the row it answered, and the key it answered with. */
interface ApproverSide {
  id: string;
  requesterPublicKey: string;
  keypair: X25519KeyPair;
}

/**
 * A device waiting for a key (the lost-key path `start()` reports as needs_enroll), plus a second
 * session on the same account to approve from and the account's real data key to hand over.
 */
async function pairingFlow(): Promise<PairingFlow> {
  const server = new FakeSyncServer();
  const device = createDevice(server);
  useStorage(device);
  await setGoals([goalFactory.build({ id: 'g1' })]);
  await device.engine.enableSync('dev', 'cred-a', 'Device A');

  const persisted = await loadPersistedDataKey(device.kv);
  if (persisted === null) {
    throw new Error('the enable left no data key to pair with');
  }
  await device.kv.remove(SYNC_DATA_KEY, 'local');
  const engine = restart(device);
  await engine.start();
  expect(engine.getStatus()).toBe('needs_enroll');

  const approver = new FakeApiClient(server);
  await approver.exchangeToken({ provider: 'dev', credential: 'cred-b', deviceName: 'Device B' });
  return {
    server,
    requester: { ...device, engine },
    approver,
    dk: persisted.dk,
    keyId: persisted.keyId,
  };
}

/** beginPairing's id, or a loud failure — narrows without a non-null assertion. */
async function beginPairing(engine: SyncEngine): Promise<string> {
  const started = await engine.beginPairing();
  if (started === null) {
    throw new Error('beginPairing answered null for a device waiting for a key');
  }
  return started.pairingId;
}

/** The approver picks up the one pending request and commits its own key to it. */
async function commitAsApprover(flow: PairingFlow): Promise<ApproverSide> {
  const pending = await flow.approver.listPairings();
  if (pending.length !== 1) {
    throw new Error(`expected exactly one pending pairing, got ${pending.length}`);
  }
  const row = pending[0];
  const keypair = await generatePairingKeypair();
  await flow.approver.commitPairing(row.id, b64urlEncode(keypair.publicKey));
  return { id: row.id, requesterPublicKey: row.requesterPublicKey, keypair };
}

/** The approver's confirm: the account's data key, wrapped to the requester's public key. */
async function wrapKeyAsApprover(flow: PairingFlow, side: ApproverSide): Promise<void> {
  const envelope = await wrapDataKeyToPeer(
    side.keypair.privateKey,
    b64urlDecode(side.requesterPublicKey),
    flow.dk,
    flow.keyId,
    side.id
  );
  await flow.approver.putPairingEnvelope(side.id, envelope);
}

/** The digits the approver's own screen derives, requester key first. */
function approverSas(side: ApproverSide): Promise<string> {
  return derivePairingSas(b64urlDecode(side.requesterPublicKey), side.keypair.publicKey, side.id);
}

describe('SyncEngine.beginPairing', () => {
  it('answers null once a key is held, and begins from a device that was asked for a code', async () => {
    const server = new FakeSyncServer();
    const first = createDevice(server);
    useStorage(first);
    await first.engine.enableSync('dev', 'cred-a', 'Device A');
    expect(first.engine.getStatus()).toBe('active');

    expect(await first.engine.beginPairing()).toBeNull();

    // Device #2 signs in, finds an account that already has a key, and is sent to the code prompt
    // reading `disabled` — the surface pairing exists to replace.
    const second = createDevice(server);
    useStorage(second);
    await expect(second.engine.enableSync('dev', 'cred-b', 'Device B')).rejects.toThrow(
      RecoveryCodeRequiredError
    );
    expect(second.engine.getStatus()).toBe('disabled');

    await beginPairing(second.engine);
    expect(await second.engine.pollPairing()).toEqual({ kind: 'waiting' });
  });

  it('answers null and reports the lost sign-in when the session is gone', async () => {
    const flow = await pairingFlow();
    await flow.requester.kv.remove(SYNC_SESSION_KEY, 'local');

    expect(await flow.requester.engine.beginPairing()).toBeNull();
    expect(flow.requester.engine.getStatus()).toBe('signed_out');
  });

  it('creates a request the account can see, and polls waiting until it is answered', async () => {
    const flow = await pairingFlow();

    const id = await beginPairing(flow.requester.engine);

    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'waiting' });
    const pending = await flow.approver.listPairings();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id, deviceName: 'Device A' });
    // Never to the device that asked: approving your own request approves nothing.
    expect(await flow.requester.apiClient.listPairings()).toEqual([]);
  });

  it("replaces this session's previous request instead of leaving two open", async () => {
    const flow = await pairingFlow();
    const first = await beginPairing(flow.requester.engine);

    const second = await beginPairing(flow.requester.engine);

    expect(second).not.toBe(first);
    expect((await flow.approver.listPairings()).map((row) => row.id)).toEqual([second]);
    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'waiting' });
  });
});

describe('SyncEngine.pollPairing', () => {
  it('answers confirm with the same digits the approver derives', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);

    const polled = await flow.requester.engine.pollPairing();

    expect(polled).toEqual({ kind: 'confirm', sas: await approverSas(side) });
    expect(polled).toMatchObject({ sas: expect.stringMatching(/^\d{6}$/) });
  });

  it('shows the digits before it will open an envelope that arrived with them', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    await wrapKeyAsApprover(flow, side);

    // Both halves landed between two polls, and the digits still have to be seen first.
    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'confirm',
      sas: await approverSas(side),
    });
    expect(flow.requester.engine.getStatus()).toBe('needs_enroll');
    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'complete' });
  });

  it('installs the wrapped key, activates, and opens the account records with it', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    // The digits reach the screen before any envelope is accepted.
    expect(await flow.requester.engine.pollPairing()).toMatchObject({ kind: 'confirm' });
    await wrapKeyAsApprover(flow, side);

    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'complete' });

    expect(flow.requester.engine.getStatus()).toBe('active');
    // The account's key, not merely a key: replay the server's own records over an empty store.
    useStorage(flow.requester);
    await replayFromScratch(flow.requester);
    expect(await flow.requester.engine.syncNow()).toEqual({ kind: 'synced' });
    expect(await getGoals()).toHaveLength(1);
    // And on disk, not only in memory — the next worker spawn starts from storage.
    const restarted = restart(flow.requester);
    await restarted.start();
    expect(restarted.getStatus()).toBe('active');
  });

  it('answers expired_or_denied once the row is gone, and begins a fresh request after it', async () => {
    const flow = await pairingFlow();
    const id = await beginPairing(flow.requester.engine);
    await flow.approver.deletePairing(id);

    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'failed',
      reason: 'expired_or_denied',
    });
    // The request is forgotten, so nothing is left to poll until the caller starts another.
    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'failed', reason: 'error' });

    const second = await beginPairing(flow.requester.engine);
    expect(second).not.toBe(id);
    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'waiting' });
  });

  it('answers expired_or_denied once the request has aged out', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);

    const expired = Date.now() + PAIRING_TTL_MS + 1;
    flow.requester.apiClient.now = () => expired;

    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'failed',
      reason: 'expired_or_denied',
    });
  });

  it('answers signed_out when the session behind the request has expired', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    flow.requester.apiClient.rejectAllWith401 = true;

    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'failed',
      reason: 'signed_out',
    });
    expect(flow.requester.engine.getStatus()).toBe('signed_out');
  });

  it('lets only one of two polls that answer together adopt the key', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    await flow.requester.engine.pollPairing();
    await wrapKeyAsApprover(flow, side);

    // Both polls park inside getPairing and are released together — two similar-latency calls
    // fired at once, which is what a 3s poll loop over a slow link actually produces.
    const gate = heldAnswer();
    const answer = flow.requester.apiClient.getPairing.bind(flow.requester.apiClient);
    let parked = 0;
    vi.spyOn(flow.requester.apiClient, 'getPairing').mockImplementation(async (id) => {
      parked += 1;
      await gate.held();
      return answer(id);
    });
    const writes = vi.spyOn(flow.requester.kv, 'set');

    const both = [flow.requester.engine.pollPairing(), flow.requester.engine.pollPairing()];
    await gate.awaited;
    expect(parked).toBe(2);
    gate.release();

    const results = await Promise.all(both);
    expect(results.filter((result) => result.kind === 'complete')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'failed')).toHaveLength(1);
    expect(writes.mock.calls.filter(([key]) => key === SYNC_DATA_KEY)).toHaveLength(1);
    expect(flow.requester.engine.getStatus()).toBe('active');
  });

  it('lets only one of two overlapping polls adopt the key', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    await flow.requester.engine.pollPairing();
    await wrapKeyAsApprover(flow, side);

    // The first poll is parked with the envelope already on the row, and a second runs past it.
    const gate = heldAnswer();
    const answer = flow.requester.apiClient.getPairing.bind(flow.requester.apiClient);
    let parkNext = true;
    vi.spyOn(flow.requester.apiClient, 'getPairing').mockImplementation(async (id) => {
      if (parkNext) {
        parkNext = false;
        await gate.held();
      }
      return answer(id);
    });
    const writes = vi.spyOn(flow.requester.kv, 'set');

    const first = flow.requester.engine.pollPairing();
    await gate.awaited;
    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'complete' });
    gate.release();

    expect(await first).toEqual({ kind: 'failed', reason: 'error' });
    expect(writes.mock.calls.filter(([key]) => key === SYNC_DATA_KEY)).toHaveLength(1);
    expect(flow.requester.engine.getStatus()).toBe('active');
  });

  it('never installs a key for an account disabled while the poll was in flight', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    await flow.requester.engine.pollPairing();
    await wrapKeyAsApprover(flow, side);

    const gate = heldAnswer();
    const answer = flow.requester.apiClient.getPairing.bind(flow.requester.apiClient);
    vi.spyOn(flow.requester.apiClient, 'getPairing').mockImplementation(async (id) => {
      await gate.held();
      return answer(id);
    });
    const polled = flow.requester.engine.pollPairing();
    await gate.awaited;
    await flow.requester.engine.disableSync();
    gate.release();

    expect(await polled).toEqual({ kind: 'failed', reason: 'error' });
    expect(flow.requester.engine.getStatus()).toBe('disabled');
    expect(await flow.requester.kv.get(CLOUD_SYNC_ENABLED_KEY, 'local')).toBeNull();
    expect(await flow.requester.kv.get(SYNC_DATA_KEY, 'local')).toBeNull();
  });
});

describe('the fake pairing relay', () => {
  it('refuses a second approver, and an envelope from anyone but the one that committed', async () => {
    const flow = await pairingFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitAsApprover(flow);

    const other = new FakeApiClient(flow.server);
    await other.exchangeToken({ provider: 'dev', credential: 'cred-c', deviceName: 'Device C' });

    await expect(other.commitPairing(id, 'another-public-key')).rejects.toMatchObject({
      code: 'pairing_conflict',
      status: 409,
    });
    await expect(other.putPairingEnvelope(id, 'v1.dk-1.aaaa.bbbb')).rejects.toMatchObject({
      code: 'pairing_conflict',
      status: 409,
    });
    await expect(other.commitPairing('no-such-row', 'k')).rejects.toMatchObject({
      code: 'pairing_not_found',
      status: 404,
    });
  });
});
