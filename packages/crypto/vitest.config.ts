import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      environment: 'node',
      // Spies on globals (crypto.subtle) must not outlive a failed test — same net as apps/api.
      restoreMocks: true,
    },
  })
);
