import type { MiddlewareHandler } from 'hono';
import type { Env } from './env';
import { problem } from './problem-details';
import type { SyncStore } from './store';

export type AuthVars = { Variables: { userId: string; tokenHash: string } };

export function requireSession(
  getStore: (env: Env) => SyncStore
): MiddlewareHandler<{ Bindings: Env } & AuthVars> {
  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (header === undefined || !header.startsWith('Bearer ')) {
      return problem('unauthorized', { detail: 'Missing bearer token.' });
    }
    const session = await getStore(c.env).lookupSession(header.slice('Bearer '.length));
    if (session === null) {
      return problem('invalid_token');
    }
    c.set('userId', session.userId);
    c.set('tokenHash', session.tokenHash);
    await next();
  };
}
