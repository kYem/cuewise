import { installChromeStorageMock } from '@cuewise/test-utils/mocks';
import { beforeEach } from 'vitest';

// chrome must exist at import time so the storage backend self-registers as
// ChromeKeyValueStore (mirroring the real extension), not the dev fallback.
installChromeStorageMock();

beforeEach(() => {
  installChromeStorageMock();
});
