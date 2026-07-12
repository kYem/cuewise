import { defineConfig } from '@playwright/test';

// ENG-48: proves Chrome actually honors `chrome-extension://<id>` in the
// player's `frame-ancestors`, driving the real built (unpacked) extension.
// Playwright only loads unpacked extensions in Chromium, and the spec manages
// its own persistent context instead of the `page` fixture, so no `projects`/
// `devices` entry is needed here.
//   pnpm --filter @cuewise/browser-extension e2e
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  timeout: 90_000,
  workers: 1,
});
