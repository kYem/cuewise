import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest(async (env) => {
  // Unsplash CDN for focus mode background images
  // Cuewise API for dynamic content loading and YouTube proxy page
  const hostPermissions: string[] = ['https://images.unsplash.com/*', 'https://*.cuewise.app/*'];

  // Add host_permissions for dev server in development mode only
  if (env.mode !== 'production') {
    hostPermissions.push('http://localhost:5173/*');
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
    permissions: ['storage', 'notifications', 'alarms'],
    host_permissions: hostPermissions,
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
    // Content Security Policy for proxy page iframe and Google Fonts
    content_security_policy: {
      extension_pages:
        "frame-src 'self' https://cuewise.app; default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src *; img-src * data: blob:;",
    },
  };
});
