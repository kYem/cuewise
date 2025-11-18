import type { MockChromeStorage } from '@cuewise/test-utils/mocks';
import { createChromeStorageMock } from '@cuewise/test-utils/mocks';
import { beforeEach } from 'vitest';

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
