import { configurePlatform } from '@cuewise/shared';
import { installChromeStorageMock } from '@cuewise/test-utils/mocks';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom';

// Incidental consumers (page components embedding EmptyState/celebration) must not
// run the real lottie SVG renderer in jsdom. Dedicated lottie tests override this
// with their own per-file vi.mock.
vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: {
    loadAnimation: vi.fn(() => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      destroy: vi.fn(),
      goToAndStop: vi.fn(),
      play: vi.fn(),
    })),
  },
}));

// Mock scrollIntoView which is not implemented in JSDOM
Element.prototype.scrollIntoView = () => {};

// chrome must exist at import time too, so @cuewise/storage self-registers the
// ChromeKeyValueStore backend (mirroring the real extension) rather than the
// localStorage dev fallback.
installChromeStorageMock();

beforeEach(() => {
  installChromeStorageMock();

  // Default no-op platform so stores never throw on getScheduler()/getNotifier();
  // individual store tests override with spies via configurePlatform().
  configurePlatform({
    scheduler: { scheduleAt: async () => {}, cancel: async () => {} },
    notifier: { notify: async () => {}, clear: async () => {} },
  });
});

// Cleanup React Testing Library after each test
afterEach(() => {
  cleanup();
});
