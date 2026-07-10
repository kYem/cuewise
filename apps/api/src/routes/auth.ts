import type { Hono } from 'hono';
import type { AuthVars } from '../auth-middleware';
import { sha256Base64Url } from '../crypto-utils';
import type { Env } from '../env';
import type { AppDepsResolved } from '../index';
import { problem, type ValidationIssue } from '../problems';
import type { Identity } from '../store';

interface TokenRequest {
  provider: 'google' | 'apple' | 'dev';
  credential: string;
  deviceName: string;
  codeVerifier?: string;
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
  if (b.provider === 'apple' && (typeof b.codeVerifier !== 'string' || b.codeVerifier === '')) {
    issues.push({ pointer: '/codeVerifier', detail: 'required non-empty string for apple' });
  }
  if (issues.length > 0) {
    return issues;
  }
  return b as unknown as TokenRequest;
}

export function registerAuthRoutes(
  app: Hono<{ Bindings: Env } & AuthVars>,
  deps: AppDepsResolved
): void {
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
      const consumed = await store.consumeAuthCode(parsed.credential);
      if (consumed === null || typeof parsed.codeVerifier !== 'string') {
        return problem('invalid_token');
      }
      // The code is already burned here; a verifier mismatch fails closed rather than
      // leaving the code redeemable for a retry.
      const computedChallenge = await sha256Base64Url(parsed.codeVerifier);
      if (computedChallenge !== consumed.codeChallenge) {
        return problem('invalid_token');
      }
      identity = {
        provider: 'apple',
        providerSub: consumed.payload.providerSub,
        email: consumed.payload.email,
      };
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
