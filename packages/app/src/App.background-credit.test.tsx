import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./utils/image-preload-cache', () => ({
  preloadImages: vi.fn(() => Promise.resolve()),
  getPreloadedCurrentUrl: vi.fn(() => 'https://images.unsplash.com/photo-ok'),
  refreshBackground: vi.fn(() => Promise.resolve(null)),
  setCustomBackgroundOverride: vi.fn(),
  getCustomBackgroundOverride: vi.fn(() => null),
}));
vi.mock('./utils/unsplash', () => ({
  loadImageWithFallback: vi.fn(),
  preloadImage: vi.fn((url: string) => Promise.resolve(url)),
  getPhotoCredit: vi.fn(() => ({
    photographer: null,
    photographerUrl: null,
    sourceUrl: 'https://unsplash.com',
  })),
  isUnsplashUrl: vi.fn(() => true),
}));

import App from './App';
import { setReducedMotion } from './components/__fixtures__/motion.fixtures';
import { useBackgroundStore } from './stores/background-store';

class StubIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** The photo layer renders unstyled until a background is applied. */
async function waitForPhoto(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByTestId('background-photo').getAttribute('style')).toContain('url(')
  );
}

// The credit sits in the bottom-left over whatever page is showing, so where it renders is
// a routing decision (App.tsx CONTENT_HEAVY_PAGES), not something the component can decide.
describe('background credit placement', () => {
  beforeEach(() => {
    setReducedMotion(false);
    window.IntersectionObserver =
      StubIntersectionObserver as unknown as typeof IntersectionObserver;
    (chrome.storage as unknown as Record<string, unknown>).onChanged = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    useBackgroundStore.setState({ customBackground: null, isLoaded: true, loadFailed: false });
  });

  afterEach(() => {
    window.location.hash = '';
    vi.restoreAllMocks();
  });

  it('credits the photo and offers a fresh one on the home page', async () => {
    render(<App />);

    await waitForPhoto();
    expect(screen.getByRole('button', { name: 'New background' })).toBeInTheDocument();
    expect(screen.getByText(/Unsplash/)).toBeInTheDocument();
  });

  it('leaves the bottom-left corner to the content on a content-heavy page', async () => {
    window.location.hash = '#goals';

    render(<App />);

    // Precondition: without a loaded photo the absence below would pass vacuously.
    await waitForPhoto();
    expect(screen.queryByRole('button', { name: 'New background' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Unsplash/)).not.toBeInTheDocument();
  });
});
