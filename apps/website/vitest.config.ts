import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      // e2e/ holds Playwright specs (*.spec.ts) plus unit-testable helpers (*.test.ts);
      // only the latter are Vitest's.
      include: ['functions/**/*.test.ts', 'e2e/**/*.test.ts'],
    },
  })
);
