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

// Legitimate embedders that ship: the published extension (id is src/lib/site.ts's
// storeUrl — a re-key must update both or the embed silently breaks) and the macOS
// app (tauri://localhost). The `tauri dev` origin is appended only for requests
// served from localhost — see isLocalhostHost — so prod never emits a dev origin.
const PLAYER_FRAME_ANCESTORS =
  'chrome-extension://abjkbnhoepcnmbabflkedbapbldnpkbf tauri://localhost';
const LOCALHOST_DEV_ORIGIN = 'http://localhost:1420';

function defaultPlayerFrameAncestors(isLocalhostRequest: boolean): string {
  return isLocalhostRequest
    ? `${PLAYER_FRAME_ANCESTORS} ${LOCALHOST_DEV_ORIGIN}`
    : PLAYER_FRAME_ANCESTORS;
}

// Host, not hostname, so a bare "localhost" and a ported "localhost:8788" both match.
function isLocalhostHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1:')
  );
}

// frame-ancestors is a parameter (default: defaultPlayerFrameAncestors above) so tests
// can prove enforcement against an arbitrary embedder id without duplicating the
// other seven directives — see apps/browser-extension/e2e/player-frame-ancestors.spec.ts.
function buildPlayerCsp(frameAncestors: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    'frame-src https://www.youtube-nocookie.com',
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');
}

const PLAYER_PATHS = new Set(['/player', '/player.html']);

/**
 * Sets the response's security headers, picking the player's frame-friendly CSP
 * for its two paths and the locked-down site CSP for everything else.
 * No X-Frame-Options is sent anywhere: it has no allowlist form, so `frame-ancestors`
 * (which does) fully replaces it in the browsers we target.
 */
export function applySecurityHeaders(
  pathname: string,
  response: Response,
  playerFrameAncestors?: string,
  isLocalhostRequest = false
): Response {
  const headers = new Headers(response.headers);
  const isPlayer = PLAYER_PATHS.has(pathname);
  const frameAncestors = playerFrameAncestors ?? defaultPlayerFrameAncestors(isLocalhostRequest);

  headers.set('Content-Security-Policy', isPlayer ? buildPlayerCsp(frameAncestors) : SITE_CSP);
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
  const { pathname, host } = new URL(context.request.url);
  return applySecurityHeaders(pathname, response, undefined, isLocalhostHost(host));
}
