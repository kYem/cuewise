import { defineConfig } from 'vitest/config';

export const sharedConfig = defineConfig({
  test: {
    globals: true,
    environment: 'node', // Override per-package as needed
    // Turbo already runs every package's suite in parallel; letting each vitest also fan out to
    // one-worker-per-core oversubscribes CI runners (the cause of the background.ts hook timeout).
    // Cap to a single worker per package in CI so total parallelism ≈ Turbo's concurrency, not N×cores.
    ...(process.env.CI ? { maxWorkers: 1, minWorkers: 1 } : {}),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/__tests__',
      ],
    },
  },
});
