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

function installChromeMock(): void {
  const mockStorage = createChromeStorageMock();
  global.chrome = {
    storage: { local: mockStorage, sync: mockStorage },
  } as ChromeMock & typeof chrome;
}

// chrome must exist at import time so the storage backend self-registers as
// ChromeKeyValueStore (mirroring the real extension), not the dev fallback.
installChromeMock();

// Mock Chrome storage API globally
beforeEach(() => {
  installChromeMock();
});
