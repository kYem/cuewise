import * as cryptoModule from '@cuewise/crypto';
import {
  b64urlDecode,
  type DataKey,
  DecryptError,
  derivePairingSas,
  encodePairingPublicKey,
  generatePairingKeypair,
  wrapDataKeyToPeer,
  type X25519KeyPair,
} from '@cuewise/crypto';
import { configurePlatform, logger } from '@cuewise/shared';
import { getGoals, setGoals } from '@cuewise/storage';
import {
  ApiError,
  type PendingPairing,
  SessionManager,
  SYNC_SESSION_KEY,
} from '@cuewise/sync-client';
import { goalFactory } from '@cuewise/test-utils/factories';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeApiClient, FakeSyncServer, PAIRING_TTL_MS } from './__fixtures__/fake-api-client';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeScheduler } from './__fixtures__/fake-scheduler';
import { CLOUD_SYNC_ENABLED_KEY, SyncEngine, type SyncEngineDeps, type SyncStatus } from './engine';
import { loadPersistedDataKey, RecoveryCodeRequiredError, SYNC_DATA_KEY } from './key-lifecycle';
import { SyncMetadataStore } from './metadata-store';

interface Device {
  kv: FakeKvStore;
  apiClient: FakeApiClient;
  scheduler: FakeScheduler;
  engine: SyncEngine;
  onRecoveryCode: ReturnType<typeof vi.fn>;
}

// Every engine createDevice makes, so afterEach can stop() each one — a markMutated call under
// real timers arms a real 2s setTimeout, and nothing else in this file ever cancels it.
let devices: Device[] = [];

afterEach(async () => {
  await Promise.all(devices.map((device) => device.engine.stop().catch(() => {})));
  devices = [];
});

/** Builds one "device": its own storage/scheduler/session, sharing the given fake server. */
function createDevice(server: FakeSyncServer, overrides: Partial<SyncEngineDeps> = {}): Device {
  const kv = new FakeKvStore();
  const apiClient = new FakeApiClient(server);
  const scheduler = new FakeScheduler();
  const onRecoveryCode = vi.fn();
  const engine = new SyncEngine({
    apiClient,
    sessionManager: new SessionManager(kv),
    keyStore: kv,
    scheduler,
    onRecoveryCode,
    ...overrides,
  });
  const device = { kv, apiClient, scheduler, engine, onRecoveryCode };
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
  /** The code the account was created with, for the enrol path that races pairing. */
  recoveryCode: string;
}

/** The approver's half after it has committed: the row it answered, and the key it answered with. */
interface ApproverSide {
  id: string;
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
  const recoveryCode = device.onRecoveryCode.mock.calls[0]?.[0];
  if (typeof recoveryCode !== 'string') {
    throw new Error('the enable minted no recovery code');
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
    recoveryCode,
  };
}

/**
 * Wire key material a test plants by hand — a hostile relay's substitution, or a wrong-session
 * caller's. Never produced by this device, so it carries the brand no encoder would give it.
 */
function planted<T extends string>(value: string): T {
  return value as T;
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
  await flow.approver.commitPairing(row.id, encodePairingPublicKey(keypair.publicKey));
  return { id: row.id, keypair };
}

/** The key the requester published once a poll revealed it — a loud failure before that. */
async function revealedPub(flow: PairingFlow, id: string): Promise<Uint8Array> {
  const row = (await flow.approver.listPairings()).find((candidate) => candidate.id === id);
  if (row === undefined || row.requesterPublicKey === null) {
    throw new Error(`the request has revealed no key to answer: ${id}`);
  }
  return b64urlDecode(row.requesterPublicKey);
}

/** The approver's confirm: the account's data key, wrapped to the key the requester revealed. */
async function wrapKeyAsApprover(flow: PairingFlow, side: ApproverSide): Promise<void> {
  const envelope = await wrapDataKeyToPeer(
    side.keypair.privateKey,
    await revealedPub(flow, side.id),
    flow.dk,
    flow.keyId,
    side.id
  );
  await flow.approver.putPairingEnvelope(side.id, envelope);
}

/** The digits the approver's own screen derives, requester key first. */
async function approverSas(flow: PairingFlow, side: ApproverSide): Promise<string> {
  return derivePairingSas(await revealedPub(flow, side.id), side.keypair.publicKey, side.id);
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

  // The active-device case above already answers null via `this.dk !== null` alone, so it cannot
  // tell PAIRING_BLOCKED_STATUSES apart from an empty list. key_init is reached with dk still
  // null — enrollAndActivate sets it only after the initial-sync status that follows — so a call
  // made from inside that window can only be refused by the status check itself.
  it('answers null mid-enroll (key_init), while dk is still null, via PAIRING_BLOCKED_STATUSES', async () => {
    const server = new FakeSyncServer();
    let midEnrollResult: Promise<{ pairingId: string } | null> | undefined;
    const onStatus = vi.fn((status: SyncStatus) => {
      if (status === 'key_init') {
        // Fires synchronously inside setStatus, before enrollAndActivate assigns this.dk.
        midEnrollResult = device.engine.beginPairing();
      }
    });
    const device = createDevice(server, { onStatus });
    useStorage(device);

    await device.engine.enableSync('dev', 'cred-a', 'Device A');

    expect(onStatus).toHaveBeenCalledWith('key_init');
    if (midEnrollResult === undefined) {
      throw new Error('expected beginPairing to have been called from the key_init listener');
    }
    await expect(midEnrollResult).resolves.toBeNull();
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
    // A commitment and nothing else: the key it covers never leaves the device until an approver's
    // own key is fixed, which is what stops a relay grinding one to force the digits.
    expect(pending[0]).toMatchObject({ requesterPublicKey: null, requesterNonce: null });
    expect(pending[0].requesterCommitment).toMatch(/^[\w-]+$/);
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

    expect(polled).toEqual({ kind: 'confirm', sas: await approverSas(flow, side) });
    expect(polled).toMatchObject({ sas: expect.stringMatching(/^\d{6}$/) });
  });

  it('reveals the key it committed to, once, on the poll that first sees the approver', async () => {
    const flow = await pairingFlow();
    const id = await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    const reveals = vi.spyOn(flow.requester.apiClient, 'revealPairing');

    expect(await flow.requester.engine.pollPairing()).toMatchObject({ kind: 'confirm' });
    expect(await flow.requester.engine.pollPairing()).toMatchObject({ kind: 'confirm' });

    expect(reveals).toHaveBeenCalledTimes(1);
    // What it revealed is what the commitment covered, so the approver's check passes.
    expect(await approverSas(flow, side)).toMatch(/^\d{6}$/);
    expect(await flow.requester.apiClient.getPairing(id)).not.toBeNull();
  });

  it('reveals once when two polls see the approver key together', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    await commitAsApprover(flow);

    // Both polls park inside getPairing and are released together, so each reads a row whose
    // approver key is present and whose reveal is not.
    const gate = heldAnswer();
    const answer = flow.requester.apiClient.getPairing.bind(flow.requester.apiClient);
    let parked = 0;
    vi.spyOn(flow.requester.apiClient, 'getPairing').mockImplementation(async (id) => {
      parked += 1;
      await gate.held();
      return answer(id);
    });
    const reveals = vi.spyOn(flow.requester.apiClient, 'revealPairing');

    const both = [flow.requester.engine.pollPairing(), flow.requester.engine.pollPairing()];
    await gate.awaited;
    expect(parked).toBe(2);
    gate.release();

    // A second reveal would be refused, and the poll that made it would fail a healthy request.
    for (const result of await Promise.all(both)) {
      expect(result).toMatchObject({ kind: 'confirm' });
    }
    expect(reveals).toHaveBeenCalledTimes(1);
  });

  it('shows the digits before it will open the envelope that follows them', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);

    // No envelope can exist yet: the approver has nothing to wrap to until this poll reveals.
    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'confirm',
      sas: await approverSas(flow, side),
    });
    expect(flow.requester.engine.getStatus()).toBe('needs_enroll');

    await wrapKeyAsApprover(flow, side);
    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'complete' });
  });

  it('fails cleanly when the row already holds a reveal this device cannot open', async () => {
    const flow = await pairingFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitAsApprover(flow);
    // A reveal from a slot this engine no longer holds — a previous process's, gone along with
    // the one private key that could have opened what it earns.
    await flow.requester.apiClient.revealPairing(
      id,
      planted('another-public-key'),
      planted('another-nonce')
    );

    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'failed', reason: 'error' });

    // Terminal and quiet: the request is forgotten, and the device is still one that may ask again.
    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'failed', reason: 'error' });
    expect(flow.requester.engine.getStatus()).toBe('needs_enroll');
    expect(await beginPairing(flow.requester.engine)).not.toBe(id);
  });

  it("logs the cause when the envelope on the row cannot be opened with this device's key", async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    expect(await flow.requester.engine.pollPairing()).toMatchObject({ kind: 'confirm' });
    // Wrapped to a key nobody holds the private half of — the corrupt/incompatible-envelope case
    // a hostile or buggy relay can produce, distinct from the reveal-conflict case above.
    const wrongPub = (await generatePairingKeypair()).publicKey;
    const envelope = await wrapDataKeyToPeer(
      side.keypair.privateKey,
      wrongPub,
      flow.dk,
      flow.keyId,
      side.id
    );
    await flow.approver.putPairingEnvelope(side.id, envelope);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'failed', reason: 'error' });

    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), expect.any(DecryptError));
    expect(flow.requester.engine.getStatus()).toBe('error');
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

  it('answers complete without adopting again once another path has enrolled this device', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    await flow.requester.engine.pollPairing();
    await wrapKeyAsApprover(flow, side);

    // The typed recovery code wins the race the enrol modal deliberately allows, while the
    // pairing request is still live and its envelope already waiting on the row.
    const writes = vi.spyOn(flow.requester.kv, 'set');
    await flow.requester.engine.resumeEnrollWithCode(flow.recoveryCode);
    expect(flow.requester.engine.getStatus()).toBe('active');
    const meta = new SyncMetadataStore(flow.requester.kv);
    const cursor = (await meta.load()).cursor;
    expect(cursor).toBeGreaterThan(0);

    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'complete' });

    // A second adopt would re-persist the key and rewind the cursor over the enrol that won.
    expect(writes.mock.calls.filter(([key]) => key === SYNC_DATA_KEY)).toHaveLength(1);
    expect((await meta.load()).cursor).toBe(cursor);
    expect(flow.requester.engine.getStatus()).toBe('active');
  });

  it('answers a non-terminal error on a transport fault, keeping the request', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    vi.spyOn(flow.requester.apiClient, 'getPairing').mockRejectedValueOnce(
      new ApiError('network_error', 0)
    );

    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'error' });

    // One offline tick must not end a live request, nor paint a device that never enrolled.
    expect(flow.requester.engine.getStatus()).toBe('needs_enroll');
    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'confirm',
      sas: await approverSas(flow, side),
    });
    await wrapKeyAsApprover(flow, side);
    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'complete' });
  });

  it('publishes the key on the next tick when the reveal itself faulted', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    vi.spyOn(flow.requester.apiClient, 'revealPairing').mockRejectedValueOnce(
      new ApiError('server_error', 500)
    );

    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'error' });

    // approverSas reads the revealed key off the row, so this only answers once it landed.
    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'confirm',
      sas: await approverSas(flow, side),
    });
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

  it('reports signed_out, not complete, when the initial sync after adopting loses auth', async () => {
    const flow = await pairingFlow();
    await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    await flow.requester.engine.pollPairing();
    await wrapKeyAsApprover(flow, side);
    // The session expires between confirm and adopt: the unwrap succeeds, but the initial sync 401s.
    flow.requester.apiClient.rejectNextGetChangesWith401 = true;

    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'failed',
      reason: 'signed_out',
    });
    expect(flow.requester.engine.getStatus()).toBe('signed_out');
  });

  it('deletes the consumed row once the requester has adopted the key', async () => {
    const flow = await pairingFlow();
    const id = await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);
    await flow.requester.engine.pollPairing();
    await wrapKeyAsApprover(flow, side);

    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'complete' });

    // Consumed, not left to age out at its TTL.
    expect(await flow.requester.apiClient.getPairing(id)).toBeNull();
  });
});

describe('the fake pairing relay', () => {
  it('refuses a second approver, and an envelope from anyone but the one that committed', async () => {
    const flow = await pairingFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitAsApprover(flow);

    const other = new FakeApiClient(flow.server);
    await other.exchangeToken({ provider: 'dev', credential: 'cred-c', deviceName: 'Device C' });

    await expect(other.commitPairing(id, planted('another-public-key'))).rejects.toMatchObject({
      code: 'pairing_conflict',
      status: 409,
    });
    await expect(other.putPairingEnvelope(id, planted('v1.dk-1.aaaa.bbbb'))).rejects.toMatchObject({
      code: 'pairing_conflict',
      status: 409,
    });
    await expect(other.commitPairing('no-such-row', planted('k'))).rejects.toMatchObject({
      code: 'pairing_not_found',
      status: 404,
    });
  });

  it('refuses a reveal before any commit, and a second one after it', async () => {
    const flow = await pairingFlow();
    const id = await beginPairing(flow.requester.engine);

    await expect(
      flow.requester.apiClient.revealPairing(id, planted('pub'), planted('nonce'))
    ).rejects.toMatchObject({
      code: 'pairing_conflict',
      status: 409,
    });

    await commitAsApprover(flow);
    await flow.requester.engine.pollPairing();
    await expect(
      flow.requester.apiClient.revealPairing(id, planted('pub'), planted('nonce'))
    ).rejects.toMatchObject({
      code: 'pairing_conflict',
      status: 409,
    });
  });

  it('refuses an envelope until the reveal is stored', async () => {
    const flow = await pairingFlow();
    const id = await beginPairing(flow.requester.engine);
    const side = await commitAsApprover(flow);

    await expect(
      flow.approver.putPairingEnvelope(id, planted('v1.dk-1.aaaa.bbbb'))
    ).rejects.toMatchObject({
      code: 'pairing_conflict',
      status: 409,
    });

    await flow.requester.engine.pollPairing();
    await expect(wrapKeyAsApprover(flow, side)).resolves.toBeUndefined();
  });
});

/** Device A: fully enrolled and active, holding the account's real data key. */
interface ApproverFlow {
  server: FakeSyncServer;
  approver: Device;
  /** Device B: signed in, but asked for a recovery code — the surface pairing replaces. */
  requester: Device;
}

/** Two real devices on the same account: one active (the approver), one needing a key. */
async function approverFlow(): Promise<ApproverFlow> {
  const server = new FakeSyncServer();
  const approver = createDevice(server);
  useStorage(approver);
  await approver.engine.enableSync('dev', 'cred-a', 'Device A');
  expect(approver.engine.getStatus()).toBe('active');

  const requester = createDevice(server);
  useStorage(requester);
  await expect(requester.engine.enableSync('dev', 'cred-b', 'Device B')).rejects.toThrow(
    RecoveryCodeRequiredError
  );
  expect(requester.engine.getStatus()).toBe('disabled');

  return { server, approver, requester };
}

/** Commits, or fails loudly — a null answer means the row was gone before this device saw it. */
async function commitPairing(engine: SyncEngine, id: string): Promise<void> {
  const committed = await engine.commitPairing(id);
  if (committed === null) {
    throw new Error('commitPairing answered null for a pending request');
  }
}

/** The pending row for this id, or a loud failure — narrows without a non-null assertion. */
async function pendingRow(engine: SyncEngine, id: string): Promise<PendingPairing> {
  const rows = await engine.listPairingRequests();
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw new Error(`no pending pairing row for ${id}`);
  }
  return row;
}

/** pollApproval's digits, or a loud failure — narrows without a non-null assertion. */
async function approvalSas(engine: SyncEngine, id: string): Promise<string> {
  const polled = await engine.pollApproval(id);
  if (polled.kind !== 'confirm') {
    throw new Error(`pollApproval answered ${polled.kind} where the digits were due`);
  }
  return polled.sas;
}

describe('SyncEngine approver pairing methods', () => {
  it('listPairingRequests answers the request with its deviceName', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);

    const pending = await flow.approver.engine.listPairingRequests();

    expect(pending).toEqual([expect.objectContaining({ id, deviceName: 'Device B' })]);
  });

  it('listPairingRequests answers [] when the engine is not active', async () => {
    const flow = await approverFlow();
    await beginPairing(flow.requester.engine);

    // A third device: signed in, not the requester, and never enrolled here — so the row IS
    // visible to a raw list call, and only the engine's own active+dk guard can hide it.
    const bystander = createDevice(flow.server);
    await expect(bystander.engine.enableSync('dev', 'cred-c', 'Device C')).rejects.toThrow(
      RecoveryCodeRequiredError
    );
    expect(bystander.engine.getStatus()).toBe('disabled');
    expect(await bystander.apiClient.listPairings()).toHaveLength(1);

    expect(await bystander.engine.listPairingRequests()).toEqual([]);
  });

  it('commitPairing answers pending, and pollApproval waits until the reveal lands', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);

    expect(await flow.approver.engine.commitPairing(id)).toEqual({ pending: true });

    // No digits yet, and none possible: they cover a key the requester has only committed to.
    expect(await flow.approver.engine.pollApproval(id)).toEqual({ kind: 'waiting' });
  });

  it('pollApproval answers the same digits the requester is shown', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);

    const shownToRequester = await flow.requester.engine.pollPairing();

    expect(shownToRequester).toEqual({
      kind: 'confirm',
      sas: await approvalSas(flow.approver.engine, id),
    });
  });

  it('pollApproval answers the digits it already has without asking the server again', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    await flow.requester.engine.pollPairing();
    const sas = await approvalSas(flow.approver.engine, id);
    const lists = vi.spyOn(flow.approver.apiClient, 'listPairings');

    expect(await flow.approver.engine.pollApproval(id)).toEqual({ kind: 'confirm', sas });

    expect(lists).not.toHaveBeenCalled();
  });

  it('pollApproval answers gone for an id this device never committed to', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);

    expect(await flow.approver.engine.pollApproval(id)).toEqual({ kind: 'failed', reason: 'gone' });
  });

  it('pollApproval answers gone once the request it committed to has vanished', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    // The requester cancelled — the ordinary end of a request nobody tampered with.
    await flow.requester.apiClient.deletePairing(id);

    expect(await flow.approver.engine.pollApproval(id)).toEqual({ kind: 'failed', reason: 'gone' });
  });

  it('pollApproval answers a non-terminal error on a transport fault, keeping the request', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    await flow.requester.engine.pollPairing();
    vi.spyOn(flow.approver.apiClient, 'listPairings').mockRejectedValueOnce(
      new ApiError('network_error', 0)
    );

    expect(await flow.approver.engine.pollApproval(id)).toEqual({ kind: 'error' });

    // One offline tick must not end a live request: the next one still earns the digits.
    expect(await flow.approver.engine.pollApproval(id)).toMatchObject({ kind: 'confirm' });
    expect(await flow.approver.engine.approvePairing(id)).toBe(true);
  });

  it('pollApproval refuses a reveal the commitment does not cover, and denies the row', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    await flow.requester.engine.pollPairing();
    // The relay swaps the revealed key for one it holds the private half of — the substitution
    // the commitment exists to catch, and the only way it could force matching digits.
    const substituted = await generatePairingKeypair();
    flow.server.substituteRevealedPublicKey(id, encodePairingPublicKey(substituted.publicKey));

    // Its own reason: the user has to be told a key was swapped, not shown "it expired".
    expect(await flow.approver.engine.pollApproval(id)).toEqual({
      kind: 'failed',
      reason: 'tampered',
    });

    // The row is gone, so no retry can land on it and nothing may be wrapped to that key.
    expect(await flow.approver.engine.listPairingRequests()).toEqual([]);
    expect(await flow.approver.engine.approvePairing(id)).toBe(false);
    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'failed',
      reason: 'expired_or_denied',
    });
  });

  it('commitPairing answers null once another session has already committed', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    const rival = new FakeApiClient(flow.server);
    await rival.exchangeToken({ provider: 'dev', credential: 'cred-c', deviceName: 'Device C' });
    const rivalKeypair = await generatePairingKeypair();
    await rival.commitPairing(id, encodePairingPublicKey(rivalKeypair.publicKey));

    expect(await flow.approver.engine.commitPairing(id)).toBeNull();
  });

  it('commitPairing answers pending again for the request it already holds', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    const commits = vi.spyOn(flow.approver.apiClient, 'commitPairing');

    expect(await flow.approver.engine.commitPairing(id)).toEqual({ pending: true });

    // A second commit would 409 and dismiss a card the live slot can still finish.
    expect(commits).not.toHaveBeenCalled();
    await flow.requester.engine.pollPairing();
    await approvalSas(flow.approver.engine, id);
    expect(await flow.approver.engine.approvePairing(id)).toBe(true);
  });

  it('commitPairing leaves a conflicting request alone for whatever slot still holds it', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    // A commit from a session this engine no longer holds — indistinguishable from a previous
    // worker's dead slot and from another approver's live one, so neither may be assumed.
    const previous = new FakeApiClient(flow.server);
    await previous.exchangeToken({ provider: 'dev', credential: 'cred-a', deviceName: 'Device A' });
    await previous.commitPairing(
      id,
      encodePairingPublicKey((await generatePairingKeypair()).publicKey)
    );
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const deleteSpy = vi.spyOn(flow.approver.apiClient, 'deletePairing');

    expect(await flow.approver.engine.commitPairing(id)).toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(id));
    expect(deleteSpy).not.toHaveBeenCalled();
    // The row survives: whichever session actually holds the committed key can still reveal and
    // reach the SAS the requester needs to confirm, instead of losing the request to a bystander.
    expect(await flow.requester.engine.pollPairing()).toMatchObject({ kind: 'confirm' });
  });

  it("approvePairing uploads an envelope the requester's pollPairing completes from", async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    // The digits must reach both screens before the account's key is wrapped to anything.
    await flow.requester.engine.pollPairing();
    await approvalSas(flow.approver.engine, id);

    expect(await flow.approver.engine.approvePairing(id)).toBe(true);

    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'complete' });
    expect(flow.requester.engine.getStatus()).toBe('active');
  });

  it('approvePairing answers false without a matching commit', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);

    expect(await flow.approver.engine.approvePairing(id)).toBe(false);
  });

  it('approvePairing answers false until a reveal has been verified', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);

    // Committed, and nothing to wrap to — the requester's key is still only a commitment.
    expect(await flow.approver.engine.approvePairing(id)).toBe(false);

    // Revealed on the server, but unverified here: the check is this device's, not the relay's.
    await flow.requester.engine.pollPairing();
    expect(await flow.approver.engine.approvePairing(id)).toBe(false);

    await approvalSas(flow.approver.engine, id);
    expect(await flow.approver.engine.approvePairing(id)).toBe(true);
  });

  it('approvePairing answers false for an id other than the one committed', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);

    expect(await flow.approver.engine.approvePairing('some-other-pairing-id')).toBe(false);
  });

  it('denyPairing deletes the row, and the requester polls failed', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);

    await flow.approver.engine.denyPairing(id);

    expect(await flow.approver.engine.listPairingRequests()).toEqual([]);
    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'failed',
      reason: 'expired_or_denied',
    });
  });

  it('denyPairing clears its own commit, so a later approvePairing answers false', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);

    await flow.approver.engine.denyPairing(id);

    expect(await flow.approver.engine.approvePairing(id)).toBe(false);
  });

  it('leaves the slot unverified when deriving the digits fails, so approvePairing refuses', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    await flow.requester.engine.pollPairing();
    // The reveal verifies against the commitment, but deriving its digits throws.
    const derive = vi
      .spyOn(cryptoModule, 'derivePairingSas')
      .mockRejectedValueOnce(new Error('derive boom'));
    const envelopes = vi.spyOn(flow.approver.apiClient, 'putPairingEnvelope');

    expect(await flow.approver.engine.pollApproval(id)).toEqual({ kind: 'error' });

    // No digits reached either screen, so the account key must not be wrapped to the peer.
    expect(await flow.approver.engine.approvePairing(id)).toBe(false);
    expect(envelopes).not.toHaveBeenCalled();

    // The slot still stands: the next tick derives cleanly and reaches the digits.
    derive.mockRestore();
    expect(await flow.approver.engine.pollApproval(id)).toMatchObject({ kind: 'confirm' });
    expect(await flow.approver.engine.approvePairing(id)).toBe(true);
  });

  it('reuses a row the caller already fetched instead of listing the account again', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    await flow.requester.engine.pollPairing();

    const lists = vi.spyOn(flow.approver.apiClient, 'listPairings');
    const rows = await flow.approver.engine.listPairingRequests();
    const row = rows.find((candidate) => candidate.id === id);

    expect(await flow.approver.engine.pollApproval(id, row)).toMatchObject({ kind: 'confirm' });

    // The card fed pollApproval the row its list poll already had, so the waiting window costs one
    // /v1/pairings stream against the shared bucket, not two.
    expect(lists).toHaveBeenCalledTimes(1);
  });

  it('treats a reveal that will not decode as tampered, and deletes the row', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    await flow.requester.engine.pollPairing();
    // A hostile relay swaps the revealed key for bytes that are not even base64url.
    flow.server.substituteRevealedPublicKey(id, planted('!!!not-base64url!!!'));

    expect(await flow.approver.engine.pollApproval(id)).toEqual({
      kind: 'failed',
      reason: 'tampered',
    });

    // The row is gone, so no retry can land on it and nothing may be wrapped to that reveal.
    expect(await flow.approver.engine.listPairingRequests()).toEqual([]);
    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'failed',
      reason: 'expired_or_denied',
    });
  });

  it('waits, rather than crying tamper, when a prefetched row carries no revealed key', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    const row = await pendingRow(flow.approver.engine, id);
    // A malformed page-realm message: the reveal fields are absent, not explicitly null.
    const malformed = { ...row, requesterPublicKey: undefined, requesterNonce: undefined };

    expect(
      await flow.approver.engine.pollApproval(id, malformed as unknown as PendingPairing)
    ).toEqual({ kind: 'waiting' });

    // Nothing accused, nothing deleted: the real reveal can still land on this row.
    expect(await flow.approver.engine.listPairingRequests()).toHaveLength(1);
  });
});

describe('SyncEngine.pollPairing against a hostile relay', () => {
  it('treats an approver key that will not decode as tampered, sparing its own reveal', async () => {
    const flow = await approverFlow();
    const id = await beginPairing(flow.requester.engine);
    await commitPairing(flow.approver.engine, id);
    // The mirror of the approver's case: bytes that are not even base64url, aimed the other way.
    flow.server.substituteApproverPublicKey(id, planted('!!!not-base64url!!!'));

    expect(await flow.requester.engine.pollPairing()).toEqual({
      kind: 'failed',
      reason: 'tampered',
    });

    // Terminal, not a poll that loops until the TTL: the request is forgotten.
    expect(await flow.requester.engine.pollPairing()).toEqual({ kind: 'failed', reason: 'error' });
    // And the one-shot reveal was never spent on a peer whose key will not parse.
    const row = await pendingRow(flow.approver.engine, id);
    expect(row.requesterPublicKey).toBeNull();
  });
});
