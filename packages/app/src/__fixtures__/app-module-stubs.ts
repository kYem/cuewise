import { vi } from 'vitest';

// jsdom never loads an image, so the real background loader waits out its load timeouts.
// Tests that only need the page mounted swap these in through an async `vi.mock` factory.

export const imagePreloadCacheStub = {
  preloadImages: vi.fn(),
  getPreloadedCurrentUrl: vi.fn(() => null),
  refreshBackground: vi.fn(() => Promise.resolve(null)),
  setCustomBackgroundOverride: vi.fn(),
  getCustomBackgroundOverride: vi.fn(() => null),
};

export const unsplashStub = {
  loadImageWithFallback: vi.fn(() => Promise.resolve(null)),
  preloadImage: vi.fn((url: string) => Promise.resolve(url)),
  getPhotoCredit: vi.fn(() => ({
    photographer: null,
    photographerUrl: null,
    sourceUrl: 'https://unsplash.com',
  })),
  isUnsplashUrl: vi.fn(() => false),
};
