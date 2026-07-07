import { configurePlatform } from '@cuewise/shared';
import type { MockChromeStorage } from '@cuewise/test-utils/mocks';
import { createChromeStorageMock } from '@cuewise/test-utils/mocks';
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
