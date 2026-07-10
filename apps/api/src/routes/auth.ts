import type { Hono } from 'hono';
import type { Env } from '../env';
import { problem, type ValidationIssue } from '../problems';
import type { Identity, SyncStore } from '../store';
import type { IdTokenVerifier } from '../verifiers';

interface AuthDeps {
  storeFactory: (db: D1Database) => SyncStore;
  googleVerifier: IdTokenVerifier;
}

interface TokenRequest {
  provider: 'google' | 'apple' | 'dev';
  credential: string;
  deviceName: string;
}

function parseTokenRequest(body: unknown): TokenRequest | ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.provider !== 'google' && b.provider !== 'apple' && b.provider !== 'dev') {
    issues.push({ pointer: '/provider', detail: "must be 'google', 'apple', or 'dev'" });
  }
  if (typeof b.credential !== 'string' || b.credential === '') {
    issues.push({ pointer: '/credential', detail: 'required non-empty string' });
  }
  if (typeof b.deviceName !== 'string' || b.deviceName === '') {
    issues.push({ pointer: '/deviceName', detail: 'required non-empty string' });
  }
  if (issues.length > 0) {
    return issues;
  }
  return b as unknown as TokenRequest;
}

export function registerAuthRoutes(app: Hono<{ Bindings: Env }>, deps: AuthDeps): void {
  app.post('/v1/auth/token', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return problem('invalid_request', { detail: 'Body must be JSON.' });
    }
    const parsed = parseTokenRequest(raw);
    if (Array.isArray(parsed)) {
      return problem('invalid_request', { errors: parsed });
    }
    const store = deps.storeFactory(c.env.DB);
    let identity: Identity;
    if (parsed.provider === 'google') {
      try {
        const verified = await deps.googleVerifier(parsed.credential, c.env);
        identity = { provider: 'google', providerSub: verified.providerSub, email: verified.email };
      } catch {
        return problem('invalid_token');
      }
    } else if (parsed.provider === 'dev') {
      if (c.env.DEV_FAKE_AUTH !== '1') {
        return problem('invalid_request', { detail: 'Unknown provider.' });
      }
      identity = { provider: 'dev', providerSub: parsed.credential };
    } else {
      // Task 7 replaces this branch with consumeAuthCode(parsed.credential).
      return problem('invalid_token');
    }
    const userId = await store.findOrCreateUser(identity);
    const token = await store.createSession(userId, parsed.deviceName);
    return c.json({ token });
  });

  app.post('/v1/auth/logout', async (c) => {
    const header = c.req.header('Authorization');
    if (header?.startsWith('Bearer ')) {
      await deps.storeFactory(c.env.DB).revokeSession(header.slice('Bearer '.length));
    }
    return c.body(null, 204);
  });
}
