import { applyD1Migrations, env } from 'cloudflare:test';
import { configureLogger } from '@cuewise/shared';
import { beforeEach } from 'vitest';

// Expected-error tests (bad tokens, malformed bodies) log through the shared
// logger — silence it so real failures stand out in test output.
configureLogger({ enabled: false });

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// pool-workers 0.18 isolates storage per FILE, not per test (the isolatedStorage option was
// removed). Our tests assume a clean DB each test, so wipe every data table before each — the
// schema (applied once above) and D1's own migration table are left intact.
beforeEach(async () => {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"
  ).all<{ name: string }>();
  // One batch = one transaction; defer FK checks to commit so parent/child delete order is moot.
  await env.DB.batch([
    env.DB.prepare('PRAGMA defer_foreign_keys = TRUE'),
    ...results.map(({ name }) => env.DB.prepare(`DELETE FROM "${name}"`)),
  ]);
});
