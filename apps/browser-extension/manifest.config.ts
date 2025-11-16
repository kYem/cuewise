import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest(async (env) => {
  const hostPermissions: string[] = [];

  // Add host_permissions for dev server in development mode only
  if (env.mode !== 'production') {
    hostPermissions.push('http://localhost:5173/*');
  }

  return {
    manifest_version: 3,
    name: 'Cuewise',
    version: pkg.version,
    description:
      'Turn your day into a meaningful journey. Daily wisdom, mindful goals, and progress tracking.',
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
  };
});
