import { defineManifest } from '@crxjs/vite-plugin';
import { loadEnv } from 'vite';
import pkg from './package.json';

export default defineManifest(async (env) => {
  // Chrome-Extension OAuth client id for Google Calendar (set per build env).
  // Empty until the user registers a client in Google Cloud. When absent, the
  // calendar optional-permissions/oauth2 block are omitted entirely so an
  // un-provisioned build ships a clean manifest (no empty client_id) and the
  // companion is hidden (not-configured mode).
  const viteEnv = loadEnv(env.mode, process.cwd(), '');
  const oauthClientId = viteEnv.VITE_GOOGLE_OAUTH_CLIENT_ID ?? '';
  const calendarEnabled = oauthClientId !== '';

  // Cloud-sync "Sign in with Google": a separate Web-app OAuth client via launchWebAuthFlow
  // (opens a tab, no CSP fetch) — shares only the `identity` optional permission with calendar.
  // Requires BOTH the client id AND the sync base URL: without the base URL main.tsx never builds
  // the sync controller, so the Sign in with Google flow is unreachable — declaring `identity`
  // then would be a dead permission. This keeps the client id inert until sync is actually enabled.
  const googleSyncClientId = viteEnv.VITE_GOOGLE_SYNC_CLIENT_ID ?? '';
  const syncEnabled = (viteEnv.VITE_SYNC_API_BASE_URL ?? '') !== '';
  const googleSyncEnabled = googleSyncClientId !== '' && syncEnabled;

  // Pinned extension key (base64 public key) for LOCAL unpacked builds only:
  // forces the same extension ID as the Web Store item, so chrome.identity OAuth
  // (which is bound to that ID) works in dev instead of failing with
  // "bad client id". Set VITE_EXTENSION_KEY in .env locally; leave it unset for
  // the release build so the published manifest omits `key` — the Web Store
  // manages the published ID.
  const extensionKey = viteEnv.VITE_EXTENSION_KEY ?? '';

  // Local player override for ENG-48 CSP verification (see apps/macos/README.md).
  // Empty by default, so production frame-src is exactly 'self' https://cuewise.app.
  const playerOrigin = viteEnv.VITE_PLAYER_ORIGIN ?? '';

  // Unsplash CDN for focus mode background images
  // Cuewise API for dynamic content loading and YouTube proxy page
  const hostPermissions: string[] = ['https://images.unsplash.com/*', 'https://*.cuewise.app/*'];

  // Add host_permissions for dev server in development mode only
  if (env.mode !== 'production') {
    hostPermissions.push('http://localhost:5173/*');
  }

  const permissions: string[] = ['storage', 'notifications', 'alarms'];

  // Calendar is opt-in: `identity` + the Google API hosts (Calendar API +
  // oauth2 token revoke) are declared optional and requested at runtime from the
  // Connect button (see google-calendar.ts), so users who never enable the
  // calendar grant nothing Google-related at install. connect-src below adds
  // these hosts only on calendar-provisioned builds — CSP is fixed per build, not
  // per user, but it isn't itself a user-facing grant.
  const optionalPermissions: string[] = [];
  const optionalHostPermissions: string[] = [];
  const identityNeeded = calendarEnabled || googleSyncEnabled;
  if (identityNeeded) {
    optionalPermissions.push('identity');
  }
  if (calendarEnabled) {
    optionalHostPermissions.push('https://www.googleapis.com/*', 'https://oauth2.googleapis.com/*');
  }

  // connect-src: scope fetch/XHR to the hosts we call (YouTube oEmbed, Cuewise
  // API/proxy, Unsplash) instead of a wildcard. Calendar (googleapis/oauth2) and
  // the dev HMR socket are added conditionally.
  const connectSrc = [
    "'self'",
    'https://images.unsplash.com',
    'https://*.cuewise.app',
    'https://www.youtube.com',
  ];
  if (calendarEnabled) {
    connectSrc.push('https://www.googleapis.com', 'https://oauth2.googleapis.com');
  }
  if (env.mode !== 'production') {
    connectSrc.push('http://localhost:5173', 'ws://localhost:5173');
    // ENG-45 cloud sync, dev-only: the wrangler-dev cloud-sync API (see
    // VITE_SYNC_API_BASE_URL in src/vite-env.d.ts). Never added to a production build.
    connectSrc.push(viteEnv.VITE_SYNC_API_BASE_URL ?? 'http://localhost:8787');
  }

  // frame-src: the player iframe's origin, extended only when VITE_PLAYER_ORIGIN
  // is set — must match the youtube-player.ts PLAYER_ORIGIN override.
  const frameSrc = ["'self'", 'https://cuewise.app'];
  if (playerOrigin) {
    frameSrc.push(playerOrigin);
  }

  return {
    manifest_version: 3,
    // Local-only: pins the unpacked build to the Web Store ID (omitted in release).
    ...(extensionKey ? { key: extensionKey } : {}),
    // Store title and search summary — keep keyword-rich (CWS search indexes both)
    name: 'Cuewise: New Tab Quotes, Goals & Pomodoro Timer',
    short_name: 'Cuewise',
    version: pkg.version,
    description:
      'Beautiful new tab page with daily motivational quotes, to-do goals, Pomodoro timer, focus mode & insights. Free and private.',
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    permissions,
    host_permissions: hostPermissions,
    ...(identityNeeded
      ? {
          optional_permissions: optionalPermissions,
          ...(optionalHostPermissions.length > 0
            ? { optional_host_permissions: optionalHostPermissions }
            : {}),
        }
      : {}),
    ...(calendarEnabled
      ? {
          oauth2: {
            client_id: oauthClientId,
            scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
          },
        }
      : {}),
    chrome_url_overrides: {
      newtab: 'index.html',
    },
    action: {
      default_title: 'Cuewise',
    },
    background: {
      service_worker: 'src/background.ts',
      type: 'module',
    },
    // CSP: scoped connect-src (was a wildcard); proxy-page iframe + Google Fonts.
    content_security_policy: {
      extension_pages: `frame-src ${frameSrc.join(' ')}; default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src ${connectSrc.join(' ')}; img-src * data: blob:;`,
    },
  };
});
