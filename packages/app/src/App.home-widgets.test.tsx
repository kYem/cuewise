import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real loader retries a blocked CDN for ~24s, which jsdom never resolves — this test only
// needs the page mounted, so it stubs the background rather than leaving those timers running.
vi.mock('./utils/image-preload-cache', () => ({
  preloadImages: vi.fn(),
  getPreloadedCurrentUrl: vi.fn(() => null),
  refreshBackground: vi.fn(() => Promise.resolve(null)),
  setCustomBackgroundOverride: vi.fn(),
  getCustomBackgroundOverride: vi.fn(() => null),
}));
vi.mock('./utils/unsplash', () => ({
  loadImageWithFallback: vi.fn(() => Promise.resolve(null)),
  preloadImage: vi.fn((url: string) => Promise.resolve(url)),
  getPhotoCredit: vi.fn(() => ({
    photographer: null,
    photographerUrl: null,
    sourceUrl: 'https://unsplash.com',
  })),
  isUnsplashUrl: vi.fn(() => false),
}));

import { installAppRenderStubs } from './__fixtures__/app-render.fixtures';
import App from './App';

describe('App home widget discovery', () => {
  beforeEach(() => {
    installAppRenderStubs();
  });

  // The picker and the chip are covered in isolation; this is the only check that the
  // entry point is actually mounted on the page it exists to serve.
  it('puts the add-widget entry point on the new tab', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Add a widget' })).toBeInTheDocument();
  });
});
