import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import type { Env } from '../env';
import { parseJsonBody } from '../http';
import type { AppDepsResolved } from '../index';
import { problem, requireNonEmptyString, type ValidationIssue } from '../problem-details';
import { MAX_DEVICE_NAME_LENGTH } from './auth';

const NO_SUCH_SESSION = 'No such session for this account.';

export function registerSessionsRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
  app.get('/v1/sessions', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const sessions = await store.listSessions(c.get('userId'), c.get('tokenHash'));
    return c.json({ sessions });
  });

  // Keep ahead of any future POST /v1/sessions/:id — Hono matches in registration order.
  app.post('/v1/sessions/revoke-others', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    const revoked = await store.revokeOtherSessions(c.get('userId'), c.get('tokenHash'));
    return c.json({ revoked });
  });

  app.delete('/v1/sessions/:id', async (c) => {
    const store = deps.storeFactory(c.env.DB);
    // Scoped by user_id in SQL: another account's session is indistinguishable from a missing one,
    // so this can't be used to probe whether an id exists.
    const found = await store.revokeSessionById(c.get('userId'), c.req.param('id'));
    if (!found) {
      return problem('not_found', { detail: NO_SUCH_SESSION });
    }
    return c.body(null, 204);
  });

  app.patch('/v1/sessions/:id', async (c) => {
    const raw = await parseJsonBody(c);
    if (raw instanceof Response) {
      return raw;
    }
    // `raw` can be JSON `null`, which is typeof 'object' — guard before reading `.deviceName`.
    if (raw === null || typeof raw !== 'object') {
      return problem('invalid_request');
    }
    const deviceName = (raw as { deviceName?: unknown }).deviceName;
    const issues: ValidationIssue[] = [];
    requireNonEmptyString(deviceName, '/deviceName', issues, {
      maxLength: MAX_DEVICE_NAME_LENGTH,
    });
    if (typeof deviceName !== 'string' || issues.length > 0) {
      return problem('invalid_request', { errors: issues });
    }
    const store = deps.storeFactory(c.env.DB);
    const found = await store.renameSession(c.get('userId'), c.req.param('id'), deviceName);
    if (!found) {
      return problem('not_found', { detail: NO_SUCH_SESSION });
    }
    return c.body(null, 204);
  });
}
