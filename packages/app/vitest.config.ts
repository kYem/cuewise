import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';
import pkg from './package.json';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    plugins: [react()],
    // Mirrors the host apps' vite.config.ts define — SettingsModal reads these directly.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_NAME__: JSON.stringify('Cuewise'),
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./vitest.setup.ts'],
    },
  })
);
