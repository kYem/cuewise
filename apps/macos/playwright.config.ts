import { defineConfig, devices } from '@playwright/test';

// Debug loop for the reused extension UI. Drives every surface in the WebKit
// engine (≈ the Tauri WKWebView) so browser-vs-WebKit gaps — undeclared globals
// like `chrome`, missing vite `define`s, unresolved asset paths — fail here
// instead of at runtime in the native window.
//
//   pnpm --filter @cuewise/macos e2e
//
// Reuses a running `pnpm dev` server if one is up, else starts vite itself.
// CAUTION: reuse trusts whatever squats on the port — a stale dev server from
// another checkout/worktree silently makes this suite test the wrong code. Set
// E2E_PORT to sidestep an occupied 1420 (e.g. parallel sessions).
const port = Number(process.env.E2E_PORT ?? 1420);

export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
  webServer: {
    command: `pnpm dev:vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
