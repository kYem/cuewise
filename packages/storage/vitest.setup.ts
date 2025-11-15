import { createChromeStorageMock } from '@cuewise/test-utils/mocks';
import { beforeEach } from 'vitest';

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
