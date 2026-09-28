import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import { detach } from '../http';
import type { AppDepsResolved } from '../index';
import { revokeRemovedGrants } from './notion';

export function registerAccountRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  app.get('/v1/export', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    return c.json(await store.exportUser(c.get('userId')));
  });

  // Account details for the sync-settings UI ("Signed in as …"). Auth + per-token rate
  // limiting are registered on /v1/account in index.ts and cover every method here.
  app.get('/v1/account', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const email = await store.getUserEmail(userId);
    return c.json({ userId, email });
  });

  app.delete('/v1/account', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const removed = await store.deleteUser(userId);
    // The rows are already gone, so the revoke has nothing left to retry from — but it must not
    // hold the 204 either, or a client timeout reads a finished delete as a failure.
    await detach(c, revokeRemovedGrants(deps.notionClientFactory(c.env), c.env, userId, removed));
    return c.body(null, 204);
  });
}
