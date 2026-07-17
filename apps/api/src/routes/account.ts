import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import type { AppDepsResolved } from '../index';

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
    const userId = c.get('userId');
    const email = await deps.storeFactory(c.env.DB).getUserEmail(userId);
    return c.json({ userId, email });
  });

  app.delete('/v1/account', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    await store.deleteUser(c.get('userId'));
    return c.body(null, 204);
  });
}
