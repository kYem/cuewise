import path from 'node:path';
// pool-workers 0.18 (vitest 4): the pool is a plugin (cloudflareTest) instead of test.poolOptions.workers,
// and the config helpers moved off the /config subpath onto the package root.
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      // The 61-request rate-limit tests make ~250 sequential D1 round-trips and
      // hit 5-7s on a starved 4-vCPU CI runner — past the 5s default (ENG-62).
      testTimeout: 15_000,
      // Restores spies (e.g. logger.warn/error) before each test runs, not after — functionally
      // beforeEach(vi.restoreAllMocks). A mock set in a file's last test is never auto-restored.
      restoreMocks: true,
    },
  };
});
