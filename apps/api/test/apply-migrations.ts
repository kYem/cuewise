import { applyD1Migrations, env } from 'cloudflare:test';
import { configureLogger } from '@cuewise/shared';

// Expected-error tests (bad tokens, malformed bodies) log through the shared
// logger — silence it so real failures stand out in test output.
configureLogger({ enabled: false });

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
