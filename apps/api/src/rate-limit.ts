import type { MiddlewareHandler } from 'hono';
import type { AuthVars } from './auth-middleware';
import type { Env } from './env';
import { problem } from './problems';
import type { SyncStore } from './store';

export function rateLimit(
  getStore: (env: Env) => SyncStore,
  opts: { limit: number; windowMs: number }
): MiddlewareHandler<{ Bindings: Env } & AuthVars> {
  return async (c, next) => {
    const { count, windowStart } = await getStore(c.env).bumpRateWindow(
      c.get('tokenHash'),
      opts.windowMs
    );
    if (count > opts.limit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + opts.windowMs - Date.now()) / 1000));
      return problem('rate_limited', {
        retryAfter,
        detail: 'Too many requests for this token; slow down and retry later.',
      });
    }
    await next();
  };
}
