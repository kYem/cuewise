import type { Env } from './env';

// Browser (CORS) access is opt-in per origin. The shipping clients need no CORS:
// the Chrome extension reaches the API from its service worker under host_permissions,
// and the Tauri webview goes through the native HTTP layer — both bypass browser CORS.
// Only browser origins (a future @cuewise/web app, local dev of the shared UI) need it.

/** Splits the comma-separated `ALLOWED_ORIGINS` var into a trimmed, non-empty list. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (raw === undefined) {
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** True only for http(s) loopback origins (any port) — the dev-mode auto-allow set. */
export function isLocalhostOrigin(origin: string): boolean {
  if (!URL.canParse(origin)) {
    return false;
  }
  const url = new URL(origin);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }
  const host = url.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return true;
  }
  return host.endsWith('.localhost');
}

/**
 * Resolves the `Access-Control-Allow-Origin` value for a request Origin, or `null` to deny.
 * An origin is allowed when it's listed in `ALLOWED_ORIGINS`, or — only when `DEV_FAKE_AUTH`
 * is on — it's a localhost origin. Never returns `*`; the exact origin is echoed so the policy
 * stays credential-safe if cookies are ever added. Production allows exactly the configured list.
 */
export function resolveAllowedOrigin(origin: string | null | undefined, env: Env): string | null {
  if (origin === undefined || origin === null || origin === '') {
    return null;
  }
  if (parseAllowedOrigins(env.ALLOWED_ORIGINS).includes(origin)) {
    return origin;
  }
  if (env.DEV_FAKE_AUTH === '1' && isLocalhostOrigin(origin)) {
    return origin;
  }
  return null;
}
