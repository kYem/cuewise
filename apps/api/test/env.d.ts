/// <reference types="@cloudflare/vitest-pool-workers" />
import type { Env } from '../src/env';

type D1Migration = { name: string; queries: string[] };

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
