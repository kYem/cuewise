import { beforeEach } from 'vitest';
import { createChromeStorageMock } from '@cuewise/test-utils/mocks';

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
