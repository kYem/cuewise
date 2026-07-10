import { logger } from '@cuewise/shared';
import { Hono } from 'hono';
import { requireSession } from './auth-middleware';
import { D1SyncStore } from './d1-store';
import type { Env } from './env';
import { problem } from './problems';
import { registerAuthRoutes } from './routes/auth';
import type { SyncStore } from './store';
import { type IdTokenVerifier, verifyGoogleIdToken } from './verifiers';

export type AppDeps = {
  storeFactory?: (db: D1Database) => SyncStore;
  googleVerifier?: IdTokenVerifier;
};

export function createApp(deps: AppDeps = {}): Hono<{ Bindings: Env }> {
  const storeFactory = deps.storeFactory ?? ((db) => new D1SyncStore(db));
  const googleVerifier = deps.googleVerifier ?? verifyGoogleIdToken;
  const app = new Hono<{ Bindings: Env }>();

  app.get('/v1/health', (c) => {
    return c.json({ status: 'ok' });
  });

  const auth = requireSession((env) => storeFactory(env.DB));
  app.use('/v1/changes', auth);
  app.use('/v1/changes/*', auth);
  app.use('/v1/export', auth);
  app.use('/v1/account', auth);
  app.use('/v1/auth/logout', auth);

  registerAuthRoutes(app, { storeFactory, googleVerifier });

  app.get('/v1/changes', (c) => c.json({ ok: true }));

  app.notFound(() => {
    return problem('not_found');
  });
  app.onError((err) => {
    logger.error('Unhandled API error', err);
    return problem('internal');
  });
  return app;
}

export default createApp();
