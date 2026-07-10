import type { Hono } from 'hono';
import type { Env } from '../env';
import type { AppDepsResolved } from '../index';
import { problem, type ValidationIssue } from '../problems';

const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;

function encodeState(state: { returnUri: string; codeChallenge: string }): string {
  return btoa(JSON.stringify(state)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeState(state: string): { returnUri: string; codeChallenge: string } | null {
  try {
    const parsed: unknown = JSON.parse(atob(state.replace(/-/g, '+').replace(/_/g, '/')));
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { returnUri?: unknown }).returnUri === 'string' &&
      typeof (parsed as { codeChallenge?: unknown }).codeChallenge === 'string'
    ) {
      return parsed as { returnUri: string; codeChallenge: string };
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
    const codeChallenge = c.req.query('code_challenge') ?? '';
    const issues: ValidationIssue[] = [];
    if (!isAllowedReturnUri(returnUri, c.env)) {
      issues.push({ pointer: '/return_uri', detail: 'return_uri is not allowlisted.' });
    }
    if (!CODE_CHALLENGE_RE.test(codeChallenge)) {
      issues.push({
        pointer: '/code_challenge',
        detail: 'code_challenge must be 43-128 base64url characters.',
      });
    }
    if (issues.length > 0) {
      return problem('invalid_request', { errors: issues });
    }
    const url = new URL('https://appleid.apple.com/auth/authorize');
    url.searchParams.set('client_id', c.env.APPLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${c.env.PUBLIC_BASE_URL}/v1/auth/apple/callback`);
    url.searchParams.set('response_type', 'code id_token');
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('scope', 'name email');
    url.searchParams.set('state', encodeState({ returnUri, codeChallenge }));
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
    const code = await deps.storeFactory(c.env.DB).mintAuthCode(
      {
        provider: 'apple',
        providerSub: identity.providerSub,
        email: identity.email,
      },
      decoded.codeChallenge
    );
    const target = new URL(decoded.returnUri);
    target.searchParams.set('code', code);
    return c.redirect(target.toString(), 302);
  });
}
