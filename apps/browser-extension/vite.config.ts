import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    hmr: {
      host: 'localhost',
      port: 5173,
    },
    strictPort: true,
    port: 5173,
  },
  legacy: {
    // Skip WebSocket token check for chrome extension dev mode
    // Required for Vite 6.0.9+ CORS policy with @crxjs
    skipWebSocketTokenCheck: true,
  },
  build: {
    rollupOptions: {
      input: {
        newtab: 'index.html',
      },
    },
    // Use esbuild for fast minification (default, ~100x faster than terser)
    // Our logger abstraction handles console filtering via configuration
    minify: 'esbuild',
  },
});
