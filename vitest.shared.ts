import { defineConfig } from 'vitest/config';

export const sharedConfig = defineConfig({
  test: {
    globals: true,
    environment: 'node', // Override per-package as needed
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
