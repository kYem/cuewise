import type { MiddlewareHandler } from 'hono';
import { bearerToken, type SessionTokenHash } from './crypto-utils';
import type { Env } from './env';
import { problem } from './problem-details';
import type { SyncStore } from './store';

export type AuthVars = { Variables: { userId: string; tokenHash: SessionTokenHash } };

export function requireSession(
  getStore: (env: Env) => SyncStore
): MiddlewareHandler<{ Bindings: Env } & AuthVars> {
  return async (c, next) => {
    const rawToken = bearerToken(c.req.header('Authorization'));
    if (rawToken === null) {
      return problem('unauthorized', { detail: 'Missing bearer token.' });
    }
    const session = await getStore(c.env).lookupSession(rawToken);
    if (session === null) {
      return problem('invalid_token');
    }
    c.set('userId', session.userId);
    c.set('tokenHash', session.tokenHash);
    await next();
  };
}
