import { defineConfig, devices } from '@playwright/test';

// ENG-48 proof: the player's real network behavior (no ad/tracking hosts) and
// frame-ancestors enforcement, driven in WebKit against the built site.
//   pnpm --filter @cuewise/website e2e
export default defineConfig({
  testDir: './e2e',
  // Only Playwright specs; *.test.ts in e2e/ are Vitest (see vitest.config.ts).
  testMatch: '**/*.spec.ts',
  reporter: 'list',
  timeout: 30_000,
  // Every spec runs its own `astro build` against the shared dist/ dir in
  // beforeAll — parallel workers would race and corrupt each other's build.
  workers: 1,
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }],
});
