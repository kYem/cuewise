import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
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
