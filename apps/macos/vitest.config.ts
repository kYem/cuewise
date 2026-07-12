import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      environment: 'node', // Reads/parses tauri.conf.json only, no DOM
      include: ['src-tauri/**/*.test.ts'],
    },
  })
);
