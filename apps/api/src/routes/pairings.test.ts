import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { clockedStore, signedInToken } from '../__fixtures__/api-test-helpers.fixtures';
import { hashSessionToken } from '../crypto-utils';
import { D1SyncStore } from '../d1-store';
import app from '../index';
import { PAIRING_TTL_MS } from '../store';

type CreateBody = { id: string; expiresAt: number };
type PairingBody = { id: string; approverPublicKey: string | null; envelope: string | null };
type ListBody = {
  pairings: { id: string; deviceName: string; requesterPublicKey: string; createdAt: number }[];
};
type ProblemBody = { code: string };

async function createPairing(token: string, publicKey = 'requester-pubkey'): Promise<Response> {
  return app.request(
    '/v1/pairings',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey }),
    },
    env
  );
}

async function getPairing(token: string, id: string): Promise<Response> {
  return app.request(`/v1/pairings/${id}`, { headers: { Authorization: `Bearer ${token}` } }, env);
}

async function listPairings(token: string): Promise<Response> {
  return app.request('/v1/pairings', { headers: { Authorization: `Bearer ${token}` } }, env);
}

async function commitPairing(
  token: string,
  id: string,
  publicKey = 'approver-pubkey'
): Promise<Response> {
  return app.request(
    `/v1/pairings/${id}/commit`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey }),
    },
    env
  );
}

async function putEnvelope(
  token: string,
  id: string,
  envelope = 'envelope-blob'
): Promise<Response> {
  return app.request(
    `/v1/pairings/${id}/envelope`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ envelope }),
    },
    env
  );
}

async function deletePairing(token: string, id: string): Promise<Response> {
  return app.request(
    `/v1/pairings/${id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    env
  );
}

describe('/v1/pairings', () => {
  it('rejects unauthenticated GET with 401 problem+json', async () => {
    const res = await app.request('/v1/pairings', {}, env);
    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
  });

  it('create then get shows a pending request with no approver key or envelope yet', async () => {
    const { token } = await signedInToken();
    const created = await createPairing(token);
    expect(created.status).toBe(200);
    const { id, expiresAt } = await created.json<CreateBody>();
    expect(id.length).toBeGreaterThan(0);
    expect(expiresAt).toBeGreaterThan(Date.now());

    const res = await getPairing(token, id);
    expect(res.status).toBe(200);
    const body = await res.json<PairingBody & { expiresAt: number }>();
    expect(body).toEqual({ id, approverPublicKey: null, envelope: null, expiresAt });
  });

  it('creating a second pairing from the same session replaces the first', async () => {
    const { token } = await signedInToken();
    const first = await (await createPairing(token, 'pubkey-1')).json<CreateBody>();
    const second = await (await createPairing(token, 'pubkey-2')).json<CreateBody>();
    expect(second.id).not.toBe(first.id);

    expect((await getPairing(token, first.id)).status).toBe(404);
    expect((await getPairing(token, second.id)).status).toBe(200);
  });

  it('the pending list is visible from another session on the account and excludes the requester', async () => {
    const { token: requesterToken, userId } = await signedInToken();
    const approverToken = await new D1SyncStore(env.DB).createSession(userId, 'laptop');
    const created = await (
      await createPairing(requesterToken, 'requester-pubkey')
    ).json<CreateBody>();

    const fromApprover = await listPairings(approverToken);
    expect(fromApprover.status).toBe(200);
    const approverBody = await fromApprover.json<ListBody>();
    expect(approverBody.pairings).toEqual([
      {
        id: created.id,
        deviceName: 'test-device',
        requesterPublicKey: 'requester-pubkey',
        createdAt: expect.any(Number),
      },
    ]);

    const fromRequester = await listPairings(requesterToken);
    const requesterBody = await fromRequester.json<ListBody>();
    expect(requesterBody.pairings).toEqual([]);
  });

  it('committing stores the approver key, visible to the requester GET', async () => {
    const { token: requesterToken, userId } = await signedInToken();
    const approverToken = await new D1SyncStore(env.DB).createSession(userId, 'laptop');
    const { id } = await (await createPairing(requesterToken)).json<CreateBody>();

    const commitRes = await commitPairing(approverToken, id, 'approver-pubkey');
    expect(commitRes.status).toBe(204);

    const res = await getPairing(requesterToken, id);
    const body = await res.json<PairingBody>();
    expect(body.approverPublicKey).toBe('approver-pubkey');
  });

  it('a second commit answers 409 pairing_conflict', async () => {
    const { token: requesterToken, userId } = await signedInToken();
    const approverToken = await new D1SyncStore(env.DB).createSession(userId, 'laptop');
    const otherApproverToken = await new D1SyncStore(env.DB).createSession(userId, 'desktop');
    const { id } = await (await createPairing(requesterToken)).json<CreateBody>();

    expect((await commitPairing(approverToken, id)).status).toBe(204);

    const second = await commitPairing(otherApproverToken, id, 'second-pubkey');
    expect(second.status).toBe(409);
    expect((await second.json<ProblemBody>()).code).toBe('pairing_conflict');
  });

  it('storing an envelope before any commit answers 409 pairing_conflict', async () => {
    const { token: requesterToken, userId } = await signedInToken();
    const approverToken = await new D1SyncStore(env.DB).createSession(userId, 'laptop');
    const { id } = await (await createPairing(requesterToken)).json<CreateBody>();

    const res = await putEnvelope(approverToken, id);
    expect(res.status).toBe(409);
    expect((await res.json<ProblemBody>()).code).toBe('pairing_conflict');
  });

  it('storing the envelope after commit is visible to the requester GET', async () => {
    const { token: requesterToken, userId } = await signedInToken();
    const approverToken = await new D1SyncStore(env.DB).createSession(userId, 'laptop');
    const { id } = await (await createPairing(requesterToken)).json<CreateBody>();
    await commitPairing(approverToken, id, 'approver-pubkey');

    const putRes = await putEnvelope(approverToken, id, 'envelope-blob');
    expect(putRes.status).toBe(204);

    const res = await getPairing(requesterToken, id);
    const body = await res.json<PairingBody>();
    expect(body.envelope).toBe('envelope-blob');
  });

  it('get, commit, and delete 404 pairing_not_found for a pairing on another account', async () => {
    const { token: requesterToken } = await signedInToken();
    const { token: otherAccountToken } = await signedInToken();
    const { id } = await (await createPairing(requesterToken)).json<CreateBody>();

    const getRes = await getPairing(otherAccountToken, id);
    expect(getRes.status).toBe(404);
    expect((await getRes.json<ProblemBody>()).code).toBe('pairing_not_found');

    const commitRes = await commitPairing(otherAccountToken, id, 'pubkey');
    expect(commitRes.status).toBe(404);
    expect((await commitRes.json<ProblemBody>()).code).toBe('pairing_not_found');

    const deleteRes = await deletePairing(otherAccountToken, id);
    expect(deleteRes.status).toBe(404);
    expect((await deleteRes.json<ProblemBody>()).code).toBe('pairing_not_found');

    expect((await getPairing(requesterToken, id)).status).toBe(200);
  });

  it('an expired pairing 404s pairing_not_found on get and commit', async () => {
    const { token, userId } = await signedInToken();
    const requesterHash = await hashSessionToken(token);
    // Routes read Date.now() themselves, so plant the row as already 10+ minutes stale
    // rather than ticking a clock the route never consults.
    const { store } = clockedStore(Date.now());
    const { id } = await store.createPairing(
      userId,
      requesterHash,
      'pubkey',
      Date.now() - PAIRING_TTL_MS - 1_000
    );

    const getRes = await getPairing(token, id);
    expect(getRes.status).toBe(404);
    expect((await getRes.json<ProblemBody>()).code).toBe('pairing_not_found');

    const commitRes = await commitPairing(token, id, 'pubkey');
    expect(commitRes.status).toBe(404);
    expect((await commitRes.json<ProblemBody>()).code).toBe('pairing_not_found');
  });

  // deletePairing has no expiry check by design (Task 3): a still-present, past-TTL row is a
  // harmless no-op cleanup, not a 404 — unlike get/commit, which gate on expires_at.
  it('delete succeeds on an expired-but-unpurged row', async () => {
    const { token, userId } = await signedInToken();
    const requesterHash = await hashSessionToken(token);
    const { store } = clockedStore(Date.now());
    const { id } = await store.createPairing(
      userId,
      requesterHash,
      'pubkey',
      Date.now() - PAIRING_TTL_MS - 1_000
    );

    expect((await deletePairing(token, id)).status).toBe(204);
    expect((await deletePairing(token, id)).status).toBe(404);
  });

  it('rejects an oversized publicKey on create with 400 invalid_request', async () => {
    const { token } = await signedInToken();
    const res = await createPairing(token, 'x'.repeat(65));
    expect(res.status).toBe(400);
    expect((await res.json<ProblemBody>()).code).toBe('invalid_request');
  });

  it('rejects an oversized envelope on PUT with 400 invalid_request', async () => {
    const { token: requesterToken, userId } = await signedInToken();
    const approverToken = await new D1SyncStore(env.DB).createSession(userId, 'laptop');
    const { id } = await (await createPairing(requesterToken)).json<CreateBody>();
    await commitPairing(approverToken, id);

    const res = await putEnvelope(approverToken, id, 'x'.repeat(1025));
    expect(res.status).toBe(400);
    expect((await res.json<ProblemBody>()).code).toBe('invalid_request');
  });

  it('delete then get 404s pairing_not_found', async () => {
    const { token } = await signedInToken();
    const { id } = await (await createPairing(token)).json<CreateBody>();

    const del = await deletePairing(token, id);
    expect(del.status).toBe(204);

    const res = await getPairing(token, id);
    expect(res.status).toBe(404);
    expect((await res.json<ProblemBody>()).code).toBe('pairing_not_found');
  });
});
