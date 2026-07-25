import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stalled CDN (a filtering proxy that black-holes requests) never settles: no load, no error.
// The whole app is gated on the glass background, so nothing here may hang forever.
vi.mock('./utils/image-preload-cache', () => ({
  preloadImages: vi.fn(() => new Promise<void>(() => undefined)),
  getPreloadedCurrentUrl: vi.fn(() => null),
  refreshBackground: vi.fn(() => Promise.resolve(null)),
  setCustomBackgroundOverride: vi.fn(),
  getCustomBackgroundOverride: vi.fn(() => null),
}));
vi.mock('./utils/unsplash', () => ({
  loadImageWithFallback: vi.fn(() => new Promise<string>(() => undefined)),
  // App.tsx decodes through this; without it the happy path throws "not a function".
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

class StubIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** The wrapper whose opacity gates every pixel of the app (App.tsx `hideContent`). */
function contentWrapper(): HTMLElement {
  const el = [...document.querySelectorAll('div')].find(
    (d) =>
      typeof d.className === 'string' &&
      d.className.includes('flex h-full w-full relative transition-opacity')
  );
  if (el === undefined) {
    throw new Error('content wrapper not found');
  }
  return el;
}

describe('App background gate', () => {
  beforeEach(() => {
    setReducedMotion(false);
    window.IntersectionObserver =
      StubIntersectionObserver as unknown as typeof IntersectionObserver;
    (chrome.storage as unknown as Record<string, unknown>).onChanged = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals the app even when the background image never loads', async () => {
    render(<App />);

    // Gate is up initially — that's intended, it prevents a flash of unstyled background.
    await waitFor(() => expect(contentWrapper().className).toContain('opacity-0'));

    await vi.advanceTimersByTimeAsync(3000);

    // A decorative photo must never hold the product hostage.
    await waitFor(() => expect(contentWrapper().className).toContain('opacity-100'));
  });

  it('stops showing the loading spinner once the deadline passes', async () => {
    render(<App />);

    await vi.advanceTimersByTimeAsync(3000);

    await waitFor(() => expect(screen.queryByText(/Brewing your view/i)).not.toBeInTheDocument());
  });

  it('shows the photo when it does load, without waiting for the deadline', async () => {
    const { getPreloadedCurrentUrl } = await import('./utils/image-preload-cache');
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue('https://images.unsplash.com/photo-ok');
    const { preloadImages } = await import('./utils/image-preload-cache');
    vi.mocked(preloadImages).mockResolvedValue(undefined);

    render(<App />);

    // Revealed by the image resolving, well before BACKGROUND_REVEAL_DEADLINE_MS.
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(contentWrapper().className).toContain('opacity-100'));
    const layer = [...document.querySelectorAll('div')].find((d) =>
      (d.getAttribute('style') ?? '').includes('images.unsplash.com')
    );
    expect(layer).toBeDefined();
  });
});
