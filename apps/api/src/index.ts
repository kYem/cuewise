import { logger } from '@cuewise/shared';
import { Hono } from 'hono';
import { type AuthVars, requireSession } from './auth-middleware';
import { D1SyncStore } from './d1-store';
import type { Env } from './env';
import { problem } from './problems';
import { rateLimit } from './rate-limit';
import { registerAccountRoutes } from './routes/account';
import { registerAppleRoutes } from './routes/apple';
import { registerAuthRoutes } from './routes/auth';
import { registerChangesRoutes } from './routes/changes';
import type { SyncStore } from './store';
import { type IdTokenVerifier, verifyAppleIdToken, verifyGoogleIdToken } from './verifiers';

export type AppDeps = {
  storeFactory?: (db: D1Database) => SyncStore;
  googleVerifier?: IdTokenVerifier;
  appleVerifier?: IdTokenVerifier;
};

export type AppDepsResolved = {
  storeFactory: (db: D1Database) => SyncStore;
  googleVerifier: IdTokenVerifier;
  appleVerifier: IdTokenVerifier;
};

export function createApp(deps: AppDeps = {}): Hono<{ Bindings: Env } & AuthVars> {
  const resolved: AppDepsResolved = {
    storeFactory: deps.storeFactory ?? ((db) => new D1SyncStore(db)),
    googleVerifier: deps.googleVerifier ?? verifyGoogleIdToken,
    appleVerifier: deps.appleVerifier ?? verifyAppleIdToken,
  };
  const app = new Hono<{ Bindings: Env } & AuthVars>();

  app.get('/v1/health', (c) => {
    return c.json({ status: 'ok' });
  });

  const auth = requireSession((env) => resolved.storeFactory(env.DB));
  app.use('/v1/changes', auth);
  app.use('/v1/changes/*', auth);
  app.use('/v1/export', auth);
  app.use('/v1/account', auth);
  app.use('/v1/auth/logout', auth);

  // Hono's `/*` wildcard already matches the bare prefix, so a single registration
  // covers both '/v1/changes' and '/v1/changes/*' — registering both would double-count.
  app.use(
    '/v1/changes/*',
    rateLimit((env) => resolved.storeFactory(env.DB), { limit: 60, windowMs: 60_000 })
  );

  registerAuthRoutes(app, resolved);
  registerAppleRoutes(app, resolved);
  registerChangesRoutes(app, resolved);
  registerAccountRoutes(app, resolved);

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
