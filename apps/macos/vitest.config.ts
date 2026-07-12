import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      environment: 'node', // No DOM needed; browser globals are stubbed per-test
      include: ['src-tauri/**/*.test.ts', 'src/**/*.test.ts'],
    },
  })
);
