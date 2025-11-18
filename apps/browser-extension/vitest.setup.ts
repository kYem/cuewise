import type { MockChromeStorage } from '@cuewise/test-utils/mocks';
import { createChromeStorageMock, resetAllStores } from '@cuewise/test-utils/mocks';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// Minimal Chrome API interface for tests
interface ChromeMock {
  storage: {
    local: MockChromeStorage;
    sync: MockChromeStorage;
  };
}

// Mock Chrome storage API globally
beforeEach(() => {
  const mockStorage = createChromeStorageMock();

  global.chrome = {
    storage: {
      local: mockStorage,
      sync: mockStorage,
    },
  } as ChromeMock & typeof chrome;
});

// Cleanup React Testing Library after each test
afterEach(() => {
  cleanup();
  resetAllStores();
});
