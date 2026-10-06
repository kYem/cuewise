import { type CoverageOptions, coverageConfigDefaults, defineConfig } from 'vitest/config';

// Vitest 4 reports only files a test imported unless `include` names the rest.
export const sharedCoverage = {
  provider: 'v8',
  reporter: ['text-summary', 'json-summary', 'html'],
  include: ['src/**/*.{ts,tsx}'],
  exclude: [
    ...coverageConfigDefaults.exclude,
    '**/__fixtures__/**',
    '**/e2e/**',
    '**/*.test.{ts,tsx}',
    '**/mockData',
    '**/__tests__',
  ],
} satisfies CoverageOptions;

export const sharedConfig = defineConfig({
  test: {
    globals: true,
    environment: 'node', // Override per-package as needed
    coverage: sharedCoverage,
  },
});
