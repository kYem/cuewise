import { vi } from 'vitest';

// The real background loader retries a blocked CDN for ~24s, which jsdom never resolves; tests
// that only need the page mounted stub it through these, via `vi.mock(path, async () => ...)`.

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
