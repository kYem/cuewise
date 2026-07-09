import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const extensionSrc = path.resolve(__dirname, '../browser-extension/src');

// Vite config tuned for Tauri: a fixed dev port the Rust side points `devUrl` at,
// no screen-clearing so Rust build errors stay visible, and a WKWebView target.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      // Bridge: reuse the extension's UI source directly (via the `@ext` alias)
      // until pages/stores are extracted to a shared package. Pin a single React
      // instance so shared hooks don't hit the "two Reacts" invalid-hook error.
      '@ext': extensionSrc,
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    // macOS ships WebKit; target Safari to avoid over-transpiling.
    target: 'safari15',
  },
});
