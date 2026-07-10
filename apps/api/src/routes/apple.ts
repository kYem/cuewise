import type { Hono } from 'hono';
import type { Env } from '../env';
import type { AppDepsResolved } from '../index';
import { problem } from '../problems';

function encodeState(returnUri: string): string {
  return btoa(JSON.stringify({ returnUri }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeState(state: string): { returnUri: string } | null {
  try {
    const parsed: unknown = JSON.parse(atob(state.replace(/-/g, '+').replace(/_/g, '/')));
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { returnUri?: unknown }).returnUri === 'string'
    ) {
      return parsed as { returnUri: string };
    }
    return null;
  } catch {
    return null;
  }
}

function isAllowedReturnUri(uri: string, env: Env): boolean {
  return env.ALLOWED_RETURN_URIS.split(',').some((allowed) => uri === allowed.trim());
}

export function registerAppleRoutes(app: Hono<{ Bindings: Env }>, deps: AppDepsResolved): void {
  app.get('/v1/auth/apple/start', (c) => {
    const returnUri = c.req.query('return_uri') ?? '';
    if (!isAllowedReturnUri(returnUri, c.env)) {
      return problem('invalid_request', { detail: 'return_uri is not allowlisted.' });
    }
    const url = new URL('https://appleid.apple.com/auth/authorize');
    url.searchParams.set('client_id', c.env.APPLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${c.env.PUBLIC_BASE_URL}/v1/auth/apple/callback`);
    url.searchParams.set('response_type', 'code id_token');
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('scope', 'name email');
    url.searchParams.set('state', encodeState(returnUri));
    return c.redirect(url.toString(), 302);
  });

  app.post('/v1/auth/apple/callback', async (c) => {
    const form = await c.req.parseBody();
    const idToken = form.id_token;
    const state = form.state;
    if (typeof idToken !== 'string' || typeof state !== 'string') {
      return problem('invalid_request', { detail: 'id_token and state are required.' });
    }
    const decoded = decodeState(state);
    if (decoded === null || !isAllowedReturnUri(decoded.returnUri, c.env)) {
      return problem('invalid_request', { detail: 'Bad state.' });
    }
    let identity: { providerSub: string; email?: string };
    try {
      identity = await deps.appleVerifier(idToken, c.env);
    } catch {
      return problem('invalid_token');
    }
    const code = await deps.storeFactory(c.env.DB).mintAuthCode({
      provider: 'apple',
      providerSub: identity.providerSub,
      email: identity.email,
    });
    const target = new URL(decoded.returnUri);
    target.searchParams.set('code', code);
    return c.redirect(target.toString(), 302);
  });
}
