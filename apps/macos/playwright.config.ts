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
  // Spec files run in parallel workers by default. On a 2-core CI runner that
  // starves csp.spec.ts — which also runs its own vite build and static server —
  // from ~13s to over its 30s budget, failing on whatever step the clock ran out
  // on. Serial on CI trades ~15s of wall time for a deterministic suite.
  workers: process.env.CI ? 1 : undefined,
  // A failed actionability check says only "waiting for element to be visible,
  // enabled and stable" — the trace's DOM snapshot is the only way to see which
  // check it was and what was on top of the element.
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
  webServer: {
    command: `pnpm dev:vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
