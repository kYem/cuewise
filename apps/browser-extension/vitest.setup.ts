import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { createChromeStorageMock, resetAllStores } from '@cuewise/test-utils/mocks';
import '@testing-library/jest-dom';

// Mock Chrome storage API globally
beforeEach(() => {
  const mockStorage = createChromeStorageMock();

  global.chrome = {
    storage: {
      local: mockStorage,
      sync: mockStorage,
    },
  } as any;
});

// Cleanup React Testing Library after each test
afterEach(() => {
  cleanup();
  resetAllStores();
});
