/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { Env as ApiEnv } from '../src/env';

type D1Migration = { name: string; queries: string[] };

// pool-workers 0.18 types `cloudflare:test`'s `env` as `Cloudflare.Env` (it was `ProvidedEnv`
// before). Augment that global with the app's real bindings plus the test-only migrations binding.
declare global {
  namespace Cloudflare {
    interface Env extends ApiEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
