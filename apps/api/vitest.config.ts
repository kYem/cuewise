import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      // The 61-request rate-limit tests make ~250 sequential D1 round-trips and
      // hit 5-7s on a starved 4-vCPU CI runner — past the 5s default (ENG-62).
      testTimeout: 15_000,
      // Restores spies (e.g. logger.warn/error) before each test runs, not after — functionally
      // beforeEach(vi.restoreAllMocks). A mock set in a file's last test is never auto-restored.
      restoreMocks: true,
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.jsonc' },
          miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
        },
      },
    },
  };
});
