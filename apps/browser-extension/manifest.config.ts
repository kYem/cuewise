import { defineManifest } from '@crxjs/vite-plugin';
import { loadEnv } from 'vite';
import pkg from './package.json';

export default defineManifest(async (env) => {
  // Unsplash CDN for focus mode background images
  // Cuewise API for dynamic content loading and YouTube proxy page
  // googleapis for the optional Google Calendar "Up next" integration
  const hostPermissions: string[] = [
    'https://images.unsplash.com/*',
    'https://*.cuewise.app/*',
    'https://www.googleapis.com/*',
  ];

  // Add host_permissions for dev server in development mode only
  if (env.mode !== 'production') {
    hostPermissions.push('http://localhost:5173/*');
  }

  // Chrome-Extension OAuth client id for Google Calendar (set per build env).
  // Empty until the user registers a client in Google Cloud — the calendar
  // feature falls back to sample data when this is absent.
  const oauthClientId = loadEnv(env.mode, process.cwd(), '').VITE_GOOGLE_OAUTH_CLIENT_ID ?? '';

  // connect-src: scope fetch/XHR to the hosts we call (YouTube oEmbed, Cuewise
  // API/proxy, Unsplash) instead of a wildcard. Dev adds the Vite HMR socket.
  const connectSrc = [
    "'self'",
    'https://images.unsplash.com',
    'https://*.cuewise.app',
    'https://www.youtube.com',
  ];
  if (env.mode !== 'production') {
    connectSrc.push('http://localhost:5173', 'ws://localhost:5173');
  }

  return {
    manifest_version: 3,
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
    permissions: ['storage', 'notifications', 'alarms', 'favicon', 'identity'],
    host_permissions: hostPermissions,
    oauth2: {
      client_id: oauthClientId,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    },
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
      extension_pages: `frame-src 'self' https://cuewise.app; default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src ${connectSrc.join(' ')}; img-src * data: blob:;`,
    },
  };
});
