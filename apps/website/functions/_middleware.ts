// Cloudflare Pages applies every matching `_headers` rule and browsers enforce
// the *intersection* of duplicate CSP headers — a global rule plus a
// player-specific one would silently break the embed. Middleware sets exactly
// one CSP per response instead, and is unit-testable (see _middleware.test.ts).

const SITE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// Legitimate embedders: the published extension, the macOS app (tauri://localhost),
// and its dev server. A stray localhost page framing the player exposes no user
// data, so the DX win of testing against it outweighs the risk.
const PLAYER_FRAME_ANCESTORS =
  'chrome-extension://abjkbnhoepcnmbabflkedbapbldnpkbf tauri://localhost http://localhost:1420';

const PLAYER_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  'frame-src https://www.youtube-nocookie.com',
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  `frame-ancestors ${PLAYER_FRAME_ANCESTORS}`,
].join('; ');

const PLAYER_PATHS = new Set(['/player', '/player.html']);

/**
 * Sets the response's security headers, picking the player's frame-friendly CSP
 * for its two paths and the locked-down site CSP for everything else.
 * No X-Frame-Options is sent anywhere: it has no allowlist form, so `frame-ancestors`
 * (which does) fully replaces it in the browsers we target.
 */
export function applySecurityHeaders(pathname: string, response: Response): Response {
  const headers = new Headers(response.headers);
  const isPlayer = PLAYER_PATHS.has(pathname);

  headers.set('Content-Security-Policy', isPlayer ? PLAYER_CSP : SITE_CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

interface MiddlewareContext {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(context: MiddlewareContext): Promise<Response> {
  const response = await context.next();
  const { pathname } = new URL(context.request.url);
  return applySecurityHeaders(pathname, response);
}
