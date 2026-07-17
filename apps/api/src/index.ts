import { logger } from '@cuewise/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { type AuthVars, requireSession } from './auth-middleware';
import { resolveAllowedOrigin } from './cors';
import { D1SyncStore } from './d1-store';
import type { Env } from './env';
import { ipRateLimit } from './ip-rate-limit';
import { problem } from './problem-details';
import { rateLimit } from './rate-limit';
import { registerAccountRoutes } from './routes/account';
import { registerAppleRoutes } from './routes/apple';
import { registerAuthRoutes } from './routes/auth';
import { registerChangesRoutes } from './routes/changes';
import {
  exchangeGoogleCode,
  type GoogleCodeExchanger,
  registerGoogleRoutes,
} from './routes/google';
import { registerKeysRoutes } from './routes/keys';
import type { SyncStore } from './store';
import { type IdTokenVerifier, verifyAppleIdToken, verifyGoogleIdToken } from './verifiers';

export type AppDeps = {
  storeFactory?: (db: D1Database) => SyncStore;
  googleVerifier?: IdTokenVerifier;
  appleVerifier?: IdTokenVerifier;
  googleCodeExchanger?: GoogleCodeExchanger;
};

export type AppDepsResolved = Required<AppDeps>;

export function createApp(deps: AppDeps = {}): Hono<{ Bindings: Env } & AuthVars> {
  const resolved: AppDepsResolved = {
    storeFactory: deps.storeFactory ?? ((db) => new D1SyncStore(db)),
    googleVerifier: deps.googleVerifier ?? verifyGoogleIdToken,
    appleVerifier: deps.appleVerifier ?? verifyAppleIdToken,
    googleCodeExchanger: deps.googleCodeExchanger ?? exchangeGoogleCode,
  };
  const app = new Hono<{ Bindings: Env } & AuthVars>();

  // CORS first: a preflight OPTIONS carries no Authorization, so this must answer it
  // before the auth/rate-limit middleware below would 401/429 it. Origin is echoed from
  // an allowlist (never `*`); the extension and Tauri clients don't rely on this at all.
  app.use(
    '/v1/*',
    cors({
      origin: (origin, c) => resolveAllowedOrigin(origin, c.env),
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 86_400,
    })
  );

  app.get('/v1/health', (c) => {
    return c.json({ status: 'ok' });
  });

  // Middleware must be registered before the route modules below — Hono silently
  // skips middleware registered after a matching route.
  const auth = requireSession((env) => resolved.storeFactory(env.DB));
  // Hono's `/*` wildcard already matches the bare prefix — see the rate-limit
  // registration below, which relies on the same behavior.
  app.use('/v1/changes/*', auth);
  app.use('/v1/keys/*', auth);
  app.use('/v1/export', auth);
  app.use('/v1/account', auth);
  app.use('/v1/auth/logout', auth);

  const perTokenRateLimit = rateLimit((env) => resolved.storeFactory(env.DB), {
    limit: 60,
    windowMs: 60_000,
  });
  app.use('/v1/changes/*', perTokenRateLimit);
  app.use('/v1/keys/*', perTokenRateLimit);
  app.use('/v1/export', perTokenRateLimit);
  app.use('/v1/account', perTokenRateLimit);

  // Unauthenticated, so only an IP-keyed limiter applies here.
  const authSurfaceRateLimit = ipRateLimit();
  app.use('/v1/auth/token', authSurfaceRateLimit);
  app.use('/v1/auth/apple/start', authSurfaceRateLimit);
  app.use('/v1/auth/apple/callback', authSurfaceRateLimit);
  app.use('/v1/auth/google/start', authSurfaceRateLimit);
  app.use('/v1/auth/google/callback', authSurfaceRateLimit);

  registerAuthRoutes(app, resolved);
  registerAppleRoutes(app, resolved);
  registerGoogleRoutes(app, resolved);
  registerChangesRoutes(app, resolved);
  registerKeysRoutes(app, resolved);
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
