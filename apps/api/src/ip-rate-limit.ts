import type { MiddlewareHandler } from 'hono';
import type { AuthVars } from './auth-middleware';
import type { Env } from './env';
import { problem } from './problems';

const PRUNE_THRESHOLD = 10_000;

export function ipRateLimit(
  opts: { limit: number; windowMs: number } = { limit: 30, windowMs: 60_000 }
): MiddlewareHandler<{ Bindings: Env } & AuthVars> {
  // Isolate-local defense-in-depth; production also fronts these routes with WAF rules.
  const hits = new Map<string, { windowStart: number; count: number }>();
  let lastPruneAt = 0;
  return async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP');
    // Cloudflare's edge always sets this header; its absence means a non-edge invocation
    // path where per-IP limiting is meaningless, so skip rather than share one 'unknown' bucket.
    if (ip === undefined) {
      await next();
      return;
    }
    const now = Date.now();
    const existing = hits.get(ip);
    const entry =
      existing === undefined || now - existing.windowStart > opts.windowMs
        ? { windowStart: now, count: 1 }
        : { windowStart: existing.windowStart, count: existing.count + 1 };
    hits.set(ip, entry);
    if (hits.size > PRUNE_THRESHOLD && now - lastPruneAt > opts.windowMs) {
      lastPruneAt = now;
      for (const [key, value] of hits) {
        if (now - value.windowStart > opts.windowMs) {
          hits.delete(key);
        }
      }
      // Sweeping once couldn't keep the map bounded under this IP cardinality; drop
      // everything rather than let it grow unbounded — bounded memory beats perfect accounting.
      if (hits.size > PRUNE_THRESHOLD) {
        hits.clear();
      }
    }
    if (entry.count > opts.limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.windowStart + opts.windowMs - now) / 1000));
      return problem('rate_limited', {
        retryAfter,
        detail: 'Too many requests from this IP; slow down and retry later.',
      });
    }
    await next();
  };
}
