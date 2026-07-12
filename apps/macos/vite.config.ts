import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import pkg from './package.json';

// Vite config tuned for Tauri: a fixed dev port the Rust side points `devUrl` at,
// no screen-clearing so Rust build errors stay visible, and a WKWebView target.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Compile-time constants the shared @cuewise/app UI expects (mirrors the
  // extension's vite config).
  define: {
    __APP_NAME__: JSON.stringify('Cuewise'),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      // Pin a single React instance so shared hooks (from @cuewise/app) don't hit
      // the "two Reacts" invalid-hook error.
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
