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

  app.delete('/v1/account', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    await store.deleteUser(c.get('userId'));
    return c.body(null, 204);
  });
}
