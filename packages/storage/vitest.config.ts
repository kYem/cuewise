import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      environment: 'jsdom', // Chrome storage adapters need DOM
      include: ['src/**/*.test.ts'],
      setupFiles: ['./vitest.setup.ts'],
    },
  })
);
