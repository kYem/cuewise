import { logger } from '@cuewise/shared';
import { randomToken } from '../crypto-utils';
import type { Env } from '../env';

// S256 PKCE challenges are always exactly 43 base64url characters (a 32-byte SHA-256 digest).
export const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

/** The payload the server HMAC-signs into `state` for every bounce flow (Apple, Google). */
export interface BounceState {
  returnUri: string;
  codeChallenge: string;
  nonce: string;
}

/** Narrows a verified-but-untyped `state` payload; shape only, signature already checked. */
export function toBounceState(parsed: unknown): BounceState | null {
  if (parsed === null || typeof parsed !== 'object') {
    return null;
  }
  const record = parsed as { returnUri?: unknown; codeChallenge?: unknown; nonce?: unknown };
  if (
    typeof record.returnUri === 'string' &&
    typeof record.codeChallenge === 'string' &&
    typeof record.nonce === 'string'
  ) {
    // Built fresh from the narrowed reads (no result cast), so nothing extra rides along.
    return {
      returnUri: record.returnUri,
      codeChallenge: record.codeChallenge,
      nonce: record.nonce,
    };
  }
  return null;
}

export function isAllowedReturnUri(uri: string, env: Env): boolean {
  return env.ALLOWED_RETURN_URIS.split(',').some((allowed) => uri === allowed.trim());
}

/** Fails closed on a missing signing key; the key itself is never logged. */
export function requireStateSigningKey(env: Env): string | null {
  if (!env.STATE_SIGNING_KEY) {
    logger.error('STATE_SIGNING_KEY is not configured');
    return null;
  }
  return env.STATE_SIGNING_KEY;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Returns to the app via an interstitial page instead of a bare 302 (ENG-66): a cross-scheme
 * redirect can't close or repaint the tab it happens in, which read as "stuck on Google" in
 * live testing. The page fires the deep link (script + meta-refresh fallback) and tells the
 * user the tab is done.
 */
export function respondWithDeepLink(target: URL, message: string): Response {
  const href = target.toString();
  // <-escape closes the </script> breakout hole even though href can't contain '<'.
  const jsHref = JSON.stringify(href).replaceAll('<', '\\u003c');
  // Per-response nonce so the CSP admits only THIS inline script — a future markup mistake that
  // echoes a request value can't execute, and can't exfiltrate the ?code= that's in scope here.
  const nonce = randomToken();
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${escapeHtml(href)}">
<title>Cuewise</title>
</head>
<body style="font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 90vh; text-align: center;">
<p>${escapeHtml(message)} You can close this tab.<br><a href="${escapeHtml(href)}">Open Cuewise</a> if it doesn't happen automatically.</p>
<script nonce="${nonce}">location.replace(${jsHref});</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // The page embeds the one-time code — never cache it, never leak it via Referer, and
      // don't let the browser sniff it into another content type.
      'Cache-Control': 'no-store',
      // frame-ancestors/base-uri aren't covered by default-src; pin them so this credential-
      // bearing page can't be framed for clickjacking or have its <base> rewritten.
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'`,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
