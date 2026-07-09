import { defineConfig, devices } from '@playwright/test';

// Debug loop for the reused extension UI. Drives every surface in the WebKit
// engine (≈ the Tauri WKWebView) so browser-vs-WebKit gaps — undeclared globals
// like `chrome`, missing vite `define`s, unresolved asset paths — fail here
// instead of at runtime in the native window.
//
//   pnpm --filter @cuewise/macos e2e
//
// Reuses a running `pnpm dev` server if one is up, else starts vite itself.
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1420',
  },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
  webServer: {
    command: 'pnpm dev:vite',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
