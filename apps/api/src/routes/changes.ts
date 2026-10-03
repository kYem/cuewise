import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import { parseJsonBody } from '../http';
import type { AppDepsResolved } from '../index';
import { problem } from '../problem-details';
import { StorageQuotaExceededError } from '../store';
import { validatePushBody } from '../validate-changes';

export function registerChangesRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  app.get('/v1/changes', async (c) => {
    const raw = c.req.query('since') ?? '';
    // Number.parseInt tolerates trailing junk ("123abc") and scientific notation ("1e5");
    // require plain digits so a malformed cursor 400s instead of silently returning the wrong window.
    if (!/^\d+$/.test(raw)) {
      return problem('invalid_cursor');
    }
    // isSafeInteger rejects both ends on its own: Number() overflows a huge numeral to
    // Infinity, and it rounds anything past 2^53 to a value outside the safe-integer range.
    const since = Number(raw);
    if (!Number.isSafeInteger(since)) {
      return problem('invalid_cursor');
    }
    const store = deps.storeFactory(c.env.DB);
    const userId = c.get('userId');
    const { lastSeq, purgedSeq } = await store.getSeqBounds(userId);
    // since=0 is always valid (full re-bootstrap). Any other cursor must not predate a purged
    // tombstone, or the client would silently miss a delete, unless it pages a listing that began
    // at 0: that one misses only a tombstone purged while it was mid-listing.
    if (since > 0 && since > lastSeq) {
      return problem('cursor_ahead');
    }
    if (since > 0 && since < purgedSeq && c.req.query('listing') !== 'full') {
      return problem('resync_required');
    }
    const { records, cursor } = await store.listChanges(userId, since, purgedSeq);
    return c.json({ records, cursor });
  });

  app.post('/v1/changes', async (c) => {
    const raw = await parseJsonBody(c);
    if (raw instanceof Response) {
      return raw;
    }
    const parsed = validatePushBody(raw, Date.now());
    if ('problemCode' in parsed) {
      return problem(parsed.problemCode, { errors: parsed.issues });
    }
    const store = deps.storeFactory(c.env.DB);
    try {
      const result = await store.applyChanges(c.get('userId'), parsed.records);
      return c.json(result);
    } catch (err) {
      if (err instanceof StorageQuotaExceededError) {
        return problem('storage_quota_exceeded', {
          detail: 'This account has reached its storage limit.',
        });
      }
      throw err;
    }
  });
}
