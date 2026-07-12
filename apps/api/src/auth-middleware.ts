import type { MiddlewareHandler } from 'hono';
import type { RawSessionToken, SessionTokenHash } from './crypto-utils';
import type { Env } from './env';
import { problem } from './problem-details';
import type { SyncStore } from './store';

export type AuthVars = { Variables: { userId: string; tokenHash: SessionTokenHash } };

export function requireSession(
  getStore: (env: Env) => SyncStore
): MiddlewareHandler<{ Bindings: Env } & AuthVars> {
  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (header === undefined || !header.startsWith('Bearer ')) {
      return problem('unauthorized', { detail: 'Missing bearer token.' });
    }
    // The sole trusted point where a wire string becomes a RawSessionToken.
    const rawToken = header.slice('Bearer '.length) as RawSessionToken;
    const session = await getStore(c.env).lookupSession(rawToken);
    if (session === null) {
      return problem('invalid_token');
    }
    c.set('userId', session.userId);
    c.set('tokenHash', session.tokenHash);
    await next();
  };
}
