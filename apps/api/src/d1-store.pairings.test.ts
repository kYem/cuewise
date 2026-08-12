import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { clockedStore, newUser, wire } from './__fixtures__/api-test-helpers.fixtures';
import { hashSessionToken } from './crypto-utils';
import { D1SyncStore } from './d1-store';
import { PAIRING_TTL_MS } from './store';

describe('D1SyncStore pairings', () => {
  it("createPairing answers an id and expiry, and replaces the same session's prior request", async () => {
    const { store, tick } = clockedStore(1_000);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);

    const first = await store.createPairing(userId, requesterHash, wire('commitment-1'), 1_000);
    expect(first.id.length).toBeGreaterThan(0);
    expect(first.expiresAt).toBe(1_000 + PAIRING_TTL_MS);

    tick(10);
    const second = await store.createPairing(userId, requesterHash, wire('commitment-2'), 1_010);

    const rows = await env.DB.prepare(
      'SELECT id, requester_commitment FROM pairings WHERE user_id = ?'
    )
      .bind(userId)
      .all<{ id: string; requester_commitment: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]?.id).toBe(second.id);
    expect(rows.results[0]?.requester_commitment).toBe('commitment-2');
  });

  it("getPairingForRequester answers null for an unknown id, another user's id, or an expired row", async () => {
    const store = new D1SyncStore(env.DB);
    const userA = await newUser(store, `u-${crypto.randomUUID()}`);
    const userB = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userA, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);

    const { id } = await store.createPairing(userA, requesterHash, wire('commitment'), 1_000);

    await expect(store.getPairingForRequester(userA, 'unknown-id', 1_000)).resolves.toBeNull();
    await expect(store.getPairingForRequester(userB, id, 1_000)).resolves.toBeNull();
    await expect(
      store.getPairingForRequester(userA, id, 1_000 + PAIRING_TTL_MS + 1)
    ).resolves.toBeNull();

    const fresh = await store.getPairingForRequester(userA, id, 1_000);
    expect(fresh).toEqual({
      id,
      approverPublicKey: null,
      envelope: null,
      expiresAt: 1_000 + PAIRING_TTL_MS,
    });
  });

  it("listPendingPairings excludes the caller's own request, joins the requester deviceName, and withholds the key until revealed", async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'new-phone');
    const requesterHash = await hashSessionToken(requesterToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);

    const { id } = await store.createPairing(userId, requesterHash, wire('commitment-1'), 1_000);

    const beforeReveal = await store.listPendingPairings(userId, approverHash, 1_000);
    expect(beforeReveal).toEqual([
      {
        id,
        deviceName: 'new-phone',
        requesterCommitment: 'commitment-1',
        requesterPublicKey: null,
        requesterNonce: null,
        createdAt: 1_000,
      },
    ]);

    const fromRequester = await store.listPendingPairings(userId, requesterHash, 1_000);
    expect(fromRequester).toEqual([]);

    await store.commitPairing(userId, id, approverHash, wire('approver-pubkey'), 1_000);
    await store.revealPairing(
      userId,
      id,
      requesterHash,
      wire('requester-pubkey'),
      wire('nonce'),
      1_000
    );

    const afterReveal = await store.listPendingPairings(userId, approverHash, 1_000);
    expect(afterReveal).toEqual([
      {
        id,
        deviceName: 'new-phone',
        requesterCommitment: 'commitment-1',
        requesterPublicKey: 'requester-pubkey',
        requesterNonce: 'nonce',
        createdAt: 1_000,
      },
    ]);
  });

  it('listPendingPairings returns pending requests oldest first, stable across polls', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const newerToken = await store.createSession(userId, 'newer-phone');
    const newerHash = await hashSessionToken(newerToken);
    const olderToken = await store.createSession(userId, 'older-phone');
    const olderHash = await hashSessionToken(olderToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);

    // Inserted newest-first, so only an explicit ORDER BY created_at can put the older one first.
    const { id: newerId } = await store.createPairing(userId, newerHash, wire('c-newer'), 2_000);
    const { id: olderId } = await store.createPairing(userId, olderHash, wire('c-older'), 1_000);

    const pending = await store.listPendingPairings(userId, approverHash, 2_001);

    expect(pending.map((row) => row.id)).toEqual([olderId, newerId]);
  });

  it('commitPairing stores the approver key once; a second commit answers conflict', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);
    const otherApproverToken = await store.createSession(userId, 'desktop');
    const otherApproverHash = await hashSessionToken(otherApproverToken);

    const { id } = await store.createPairing(
      userId,
      requesterHash,
      wire('requester-commitment'),
      1_000
    );

    await expect(
      store.commitPairing(userId, id, approverHash, wire('approver-pubkey'), 1_000)
    ).resolves.toBe('committed');

    const committed = await store.getPairingForRequester(userId, id, 1_000);
    expect(committed?.approverPublicKey).toBe('approver-pubkey');

    await expect(
      store.commitPairing(userId, id, otherApproverHash, wire('second-pubkey'), 1_000)
    ).resolves.toBe('conflict');
  });

  it('commitPairing answers not_found for expired rows', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);

    const { id } = await store.createPairing(
      userId,
      requesterHash,
      wire('requester-commitment'),
      1_000
    );

    await expect(
      store.commitPairing(userId, 'unknown-id', approverHash, wire('pubkey'), 1_000)
    ).resolves.toBe('not_found');
    await expect(
      store.commitPairing(userId, id, approverHash, wire('pubkey'), 1_000 + PAIRING_TTL_MS + 1)
    ).resolves.toBe('not_found');
  });

  it('revealPairing answers conflict when attempted before any commit', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);

    const { id } = await store.createPairing(
      userId,
      requesterHash,
      wire('requester-commitment'),
      1_000
    );

    await expect(
      store.revealPairing(userId, id, requesterHash, wire('requester-pubkey'), wire('nonce'), 1_000)
    ).resolves.toBe('conflict');
  });

  it('revealPairing answers conflict when the caller is not the requester session', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);

    const { id } = await store.createPairing(
      userId,
      requesterHash,
      wire('requester-commitment'),
      1_000
    );
    await store.commitPairing(userId, id, approverHash, wire('approver-pubkey'), 1_000);

    // The approver's own session cannot reveal on the requester's behalf.
    await expect(
      store.revealPairing(userId, id, approverHash, wire('requester-pubkey'), wire('nonce'), 1_000)
    ).resolves.toBe('conflict');
  });

  it('revealPairing stores the key once; a second reveal answers conflict', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);

    const { id } = await store.createPairing(
      userId,
      requesterHash,
      wire('requester-commitment'),
      1_000
    );
    await store.commitPairing(userId, id, approverHash, wire('approver-pubkey'), 1_000);

    await expect(
      store.revealPairing(
        userId,
        id,
        requesterHash,
        wire('requester-pubkey'),
        wire('nonce-1'),
        1_000
      )
    ).resolves.toBe('revealed');

    await expect(
      store.revealPairing(
        userId,
        id,
        requesterHash,
        wire('requester-pubkey'),
        wire('nonce-2'),
        1_000
      )
    ).resolves.toBe('conflict');
  });

  it('revealPairing answers not_found for an unknown id or an expired row', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);

    const { id } = await store.createPairing(
      userId,
      requesterHash,
      wire('requester-commitment'),
      1_000
    );
    await store.commitPairing(userId, id, approverHash, wire('approver-pubkey'), 1_000);

    await expect(
      store.revealPairing(userId, 'unknown-id', requesterHash, wire('pubkey'), wire('nonce'), 1_000)
    ).resolves.toBe('not_found');
    await expect(
      store.revealPairing(
        userId,
        id,
        requesterHash,
        wire('pubkey'),
        wire('nonce'),
        1_000 + PAIRING_TTL_MS + 1
      )
    ).resolves.toBe('not_found');
  });

  it('putPairingEnvelope requires a stored reveal, then the committing session', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);
    const otherToken = await store.createSession(userId, 'desktop');
    const otherHash = await hashSessionToken(otherToken);

    const { id } = await store.createPairing(
      userId,
      requesterHash,
      wire('requester-commitment'),
      1_000
    );
    await store.commitPairing(userId, id, approverHash, wire('approver-pubkey'), 1_000);

    // Envelope refused until the reveal lands, even from the committing session.
    await expect(
      store.putPairingEnvelope(userId, id, approverHash, wire('envelope-blob'), 1_000)
    ).resolves.toBe('conflict');

    await store.revealPairing(
      userId,
      id,
      requesterHash,
      wire('requester-pubkey'),
      wire('nonce'),
      1_000
    );

    await expect(
      store.putPairingEnvelope(userId, id, otherHash, wire('envelope-blob'), 1_000)
    ).resolves.toBe('conflict');

    await expect(
      store.putPairingEnvelope(userId, id, approverHash, wire('envelope-blob'), 1_000)
    ).resolves.toBe('stored');

    const stored = await store.getPairingForRequester(userId, id, 1_000);
    expect(stored?.envelope).toBe('envelope-blob');
  });

  it('putPairingEnvelope before any commit answers conflict', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);

    const { id } = await store.createPairing(
      userId,
      requesterHash,
      wire('requester-commitment'),
      1_000
    );

    await expect(
      store.putPairingEnvelope(userId, id, approverHash, wire('envelope-blob'), 1_000)
    ).resolves.toBe('conflict');
  });

  it("deletePairing answers false for an id that is not this user's", async () => {
    const store = new D1SyncStore(env.DB);
    const userA = await newUser(store, `u-${crypto.randomUUID()}`);
    const userB = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userA, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);

    const { id } = await store.createPairing(userA, requesterHash, wire('commitment'), 1_000);

    await expect(store.deletePairing(userB, id)).resolves.toBe(false);
    await expect(store.getPairingForRequester(userA, id, 1_000)).resolves.not.toBeNull();

    await expect(store.deletePairing(userA, id)).resolves.toBe(true);
    await expect(store.getPairingForRequester(userA, id, 1_000)).resolves.toBeNull();
  });

  it('purgeExpiredPairings removes only expired rows', async () => {
    const { store, tick } = clockedStore(1_000);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const staleToken = await store.createSession(userId, 'old-phone');
    const staleHash = await hashSessionToken(staleToken);
    await store.createPairing(userId, staleHash, wire('stale-commitment'), 1_000);

    tick(PAIRING_TTL_MS + 1);
    const freshToken = await store.createSession(userId, 'new-phone');
    const freshHash = await hashSessionToken(freshToken);
    const { id: freshId } = await store.createPairing(
      userId,
      freshHash,
      wire('fresh-commitment'),
      1_000 + PAIRING_TTL_MS + 1
    );

    const removed = await store.purgeExpiredPairings(1_000 + PAIRING_TTL_MS + 1);

    expect(removed).toBe(1);
    const rows = await env.DB.prepare('SELECT id FROM pairings').all<{ id: string }>();
    expect(rows.results.map((r) => r.id)).toEqual([freshId]);
  });

  it('the full commit-then-reveal-then-envelope order succeeds end to end', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);

    const { id } = await store.createPairing(
      userId,
      requesterHash,
      wire('requester-commitment'),
      1_000
    );
    await expect(
      store.commitPairing(userId, id, approverHash, wire('approver-pubkey'), 1_000)
    ).resolves.toBe('committed');
    await expect(
      store.revealPairing(userId, id, requesterHash, wire('requester-pubkey'), wire('nonce'), 1_000)
    ).resolves.toBe('revealed');
    await expect(
      store.putPairingEnvelope(userId, id, approverHash, wire('envelope-blob'), 1_000)
    ).resolves.toBe('stored');

    const requesterView = await store.getPairingForRequester(userId, id, 1_000);
    expect(requesterView).toEqual({
      id,
      approverPublicKey: 'approver-pubkey',
      envelope: 'envelope-blob',
      expiresAt: 1_000 + PAIRING_TTL_MS,
    });
  });

  it('listPendingPairings drops a row once its envelope is stored, unlike a merely-revealed one', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, `u-${crypto.randomUUID()}`);
    const requesterToken = await store.createSession(userId, 'phone');
    const requesterHash = await hashSessionToken(requesterToken);
    const approverToken = await store.createSession(userId, 'laptop');
    const approverHash = await hashSessionToken(approverToken);

    const { id } = await store.createPairing(
      userId,
      requesterHash,
      wire('requester-commitment'),
      1_000
    );
    await store.commitPairing(userId, id, approverHash, wire('approver-pubkey'), 1_000);
    await store.revealPairing(
      userId,
      id,
      requesterHash,
      wire('requester-pubkey'),
      wire('nonce'),
      1_000
    );

    // Revealed but not yet enveloped: still pending, the state d1-store's other pairing tests
    // already cover.
    const beforeEnvelope = await store.listPendingPairings(userId, approverHash, 1_000);
    expect(beforeEnvelope.map((row) => row.id)).toEqual([id]);

    await store.putPairingEnvelope(userId, id, approverHash, wire('envelope-blob'), 1_000);

    const afterEnvelope = await store.listPendingPairings(userId, approverHash, 1_000);
    expect(afterEnvelope).toEqual([]);
  });
});
