import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite config tuned for Tauri: a fixed dev port the Rust side points `devUrl` at,
// no screen-clearing so Rust build errors stay visible, and a WKWebView build target.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    // macOS ships WebKit; target Safari to avoid over-transpiling.
    target: 'safari15',
  },
});
