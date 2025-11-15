import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import manifest from './src/manifest.json';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        newtab: 'index.html',
      },
    },
    // Minification options for production
    minify: 'terser',
    terserOptions: {
      compress: {
        // Remove console.log, console.debug, console.info in production
        // Keep console.warn and console.error for critical issues
        drop_console: false, // We'll handle this via our logger config
        drop_debugger: true, // Remove debugger statements
        pure_funcs: ['console.log', 'console.debug', 'console.info'], // Remove specific console calls
      },
      format: {
        comments: false, // Remove comments
      },
    },
  },
});
