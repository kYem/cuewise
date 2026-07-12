import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Spies on globals (crypto.subtle) must not outlive a failed test — same net as apps/api.
    restoreMocks: true,
  },
});
