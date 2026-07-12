import { logger } from '@cuewise/shared';
import { Hono } from 'hono';
import { type AuthVars, requireSession } from './auth-middleware';
import { D1SyncStore } from './d1-store';
import type { Env } from './env';
import { ipRateLimit } from './ip-rate-limit';
import { problem } from './problem-details';
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

export type AppDepsResolved = Required<AppDeps>;

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

  // Middleware must be registered before the route modules below — Hono silently
  // skips middleware registered after a matching route.
  const auth = requireSession((env) => resolved.storeFactory(env.DB));
  // Hono's `/*` wildcard already matches the bare prefix — see the rate-limit
  // registration below, which relies on the same behavior.
  app.use('/v1/changes/*', auth);
  app.use('/v1/export', auth);
  app.use('/v1/account', auth);
  app.use('/v1/auth/logout', auth);

  const perTokenRateLimit = rateLimit((env) => resolved.storeFactory(env.DB), {
    limit: 60,
    windowMs: 60_000,
  });
  app.use('/v1/changes/*', perTokenRateLimit);
  app.use('/v1/export', perTokenRateLimit);
  app.use('/v1/account', perTokenRateLimit);

  // Unauthenticated, so only an IP-keyed limiter applies here.
  const authSurfaceRateLimit = ipRateLimit();
  app.use('/v1/auth/token', authSurfaceRateLimit);
  app.use('/v1/auth/apple/start', authSurfaceRateLimit);
  app.use('/v1/auth/apple/callback', authSurfaceRateLimit);

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
