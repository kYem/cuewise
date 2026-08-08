import { env } from 'cloudflare:test';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { signedInToken } from '../__fixtures__/api-test-helpers.fixtures';
import type { AuthVars } from '../auth-middleware';
import { D1SyncStore } from '../d1-store';
import type { Env } from '../env';
import app from '../index';

type App = Hono<{ Bindings: Env } & AuthVars>;
type SessionBody = {
  sessions: { id: string; deviceName: string; lastUsedAt: number | null; current: boolean }[];
};

async function listSessions(app: App, token: string): Promise<Response> {
  return app.request('/v1/sessions', { headers: { Authorization: `Bearer ${token}` } }, env);
}

async function readSessions(app: App, token: string): Promise<SessionBody['sessions']> {
  const res = await listSessions(app, token);
  return (await res.json<SessionBody>()).sessions;
}

describe('/v1/sessions', () => {
  it('rejects unauthenticated GET with 401 problem+json', async () => {
    const res = await app.request('/v1/sessions', {}, env);
    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
  });

  it('marks exactly one session as current', async () => {
    const { token, userId } = await signedInToken();
    await new D1SyncStore(env.DB).createSession(userId, 'second-device');

    const sessions = await readSessions(app, token);

    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
  });

  it('404s when revoking a session owned by another account, leaving it live', async () => {
    const victim = await signedInToken();
    const attacker = await signedInToken();
    const [victimSession] = await readSessions(app, victim.token);

    const res = await app.request(
      `/v1/sessions/${victimSession.id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${attacker.token}` } },
      env
    );

    expect(res.status).toBe(404);
    expect((await listSessions(app, victim.token)).status).toBe(200);
  });

  it('revokes idempotently and the revoked token then 401s', async () => {
    const { token, userId } = await signedInToken();
    const doomed = await new D1SyncStore(env.DB).createSession(userId, 'stolen-laptop');
    const sessions = await readSessions(app, token);
    const target = sessions.find((s) => s.deviceName === 'stolen-laptop');
    expect(target).toBeDefined();
    const id = target === undefined ? '' : target.id;

    const headers = { Authorization: `Bearer ${token}` };
    const first = await app.request(`/v1/sessions/${id}`, { method: 'DELETE', headers }, env);
    const second = await app.request(`/v1/sessions/${id}`, { method: 'DELETE', headers }, env);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect((await listSessions(app, doomed)).status).toBe(401);
  });

  it('renames a session', async () => {
    const { token } = await signedInToken();
    const [session] = await readSessions(app, token);

    const res = await app.request(
      `/v1/sessions/${session.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName: 'Work MacBook' }),
      },
      env
    );

    expect(res.status).toBe(204);
    expect((await readSessions(app, token))[0].deviceName).toBe('Work MacBook');
  });

  it('rejects an empty rename with invalid_request', async () => {
    const { token } = await signedInToken();
    const [session] = await readSessions(app, token);

    const res = await app.request(
      `/v1/sessions/${session.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName: '' }),
      },
      env
    );

    expect(res.status).toBe(400);
    expect((await res.json<{ code: string }>()).code).toBe('invalid_request');
  });

  it('rejects a null JSON body without throwing', async () => {
    const { token } = await signedInToken();
    const [session] = await readSessions(app, token);

    const res = await app.request(
      `/v1/sessions/${session.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: 'null',
      },
      env
    );

    expect(res.status).toBe(400);
    expect((await res.json<{ code: string }>()).code).toBe('invalid_request');
  });

  it('rejects a rename past the shared device-name bound', async () => {
    const { token } = await signedInToken();
    const [session] = await readSessions(app, token);

    const res = await app.request(
      `/v1/sessions/${session.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName: 'x'.repeat(101) }),
      },
      env
    );

    expect(res.status).toBe(400);
  });

  it('revoke-others leaves the caller signed in and reports the count', async () => {
    const { token, userId } = await signedInToken();
    const store = new D1SyncStore(env.DB);
    await store.createSession(userId, 'desktop');
    await store.createSession(userId, 'phone');

    const res = await app.request(
      '/v1/sessions/revoke-others',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(200);
    expect((await res.json<{ revoked: number }>()).revoked).toBe(2);
    expect((await listSessions(app, token)).status).toBe(200);
  });
});
