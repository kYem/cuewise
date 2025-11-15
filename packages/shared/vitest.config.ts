import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      environment: 'node', // Pure utility functions, no DOM
      include: ['src/**/*.test.ts'],
    },
  })
);
