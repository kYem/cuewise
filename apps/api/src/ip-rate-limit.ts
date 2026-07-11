import type { MiddlewareHandler } from 'hono';
import type { AuthVars } from './auth-middleware';
import type { Env } from './env';
import { problem } from './problem-details';

const DEFAULT_MAX_TRACKED_IPS = 20_000;

export interface IpRateLimitOptions {
  limit: number;
  windowMs: number;
  maxTrackedIps?: number;
  now?: () => number;
}

export function ipRateLimit(
  opts: IpRateLimitOptions = { limit: 30, windowMs: 60_000 }
): MiddlewareHandler<{ Bindings: Env } & AuthVars> {
  const maxTrackedIps = opts.maxTrackedIps ?? DEFAULT_MAX_TRACKED_IPS;
  const now = opts.now ?? Date.now;
  // Isolate-local defense-in-depth; production also fronts these routes with WAF rules.
  let windowStart = now();
  let hits = new Map<string, number>();
  return async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP');
    // Cloudflare's edge always sets this header; its absence means a non-edge invocation
    // path where per-IP limiting is meaningless, so skip rather than share one 'unknown' bucket.
    if (ip === undefined) {
      await next();
      return;
    }
    const t = now();
    if (t >= windowStart + opts.windowMs) {
      windowStart = t;
      hits = new Map();
    }
    const existingCount = hits.get(ip);
    if (existingCount === undefined && hits.size >= maxTrackedIps) {
      // Bounded memory without evicting anyone: a flood of fresh IPs can only dodge
      // tracking for itself, never evict or reset another client's counter.
      await next();
      return;
    }
    const count = (existingCount ?? 0) + 1;
    hits.set(ip, count);
    if (count > opts.limit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + opts.windowMs - t) / 1000));
      return problem('rate_limited', {
        retryAfter,
        detail: 'Too many requests from this IP; slow down and retry later.',
      });
    }
    await next();
  };
}
