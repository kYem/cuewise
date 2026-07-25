import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A blocked CDN takes ~32s to exhaust the retries below — far too long to gate the app on.
// A never-settling promise stands in for that wait.
vi.mock('./utils/image-preload-cache', () => ({
  preloadImages: vi.fn(),
  getPreloadedCurrentUrl: vi.fn(),
  refreshBackground: vi.fn(() => Promise.resolve(null)),
  setCustomBackgroundOverride: vi.fn(),
  getCustomBackgroundOverride: vi.fn(() => null),
}));
vi.mock('./utils/unsplash', () => ({
  loadImageWithFallback: vi.fn(() => new Promise<string>(() => undefined)),
  // App.tsx loads through this; without it the happy path throws "not a function".
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
import { getPreloadedCurrentUrl, preloadImages } from './utils/image-preload-cache';
import { preloadImage } from './utils/unsplash';

/** Mirrors BACKGROUND_REVEAL_DEADLINE_MS in App.tsx; raising it there must fail these. */
const REVEAL_DEADLINE_MS = 1500;
const PHOTO = 'https://images.unsplash.com/photo-ok';

class StubIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** Captured before any test stubs it, so replacing the action can't leak between tests. */
const realLoadCustomBackground = useBackgroundStore.getState().loadCustomBackground;

/** The wrapper gating the main content + theme switcher (App.tsx `hideContent`). */
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

function photoLayer(): HTMLElement | undefined {
  return [...document.querySelectorAll('div')].find((d) =>
    (d.getAttribute('style') ?? '').includes('images.unsplash.com')
  );
}

// These tests assume glass is the default theme (DEFAULT_SETTINGS.colorTheme); without it
// nothing is gated and the spinner assertions would pass vacuously.
describe('App background gate', () => {
  beforeEach(() => {
    setReducedMotion(false);
    window.IntersectionObserver =
      StubIntersectionObserver as unknown as typeof IntersectionObserver;
    (chrome.storage as unknown as Record<string, unknown>).onChanged = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    // Re-established per test: a leaked happy-path stub would let the app reveal via the
    // image and silently disarm the deadline tests, whatever order they run in.
    vi.mocked(preloadImages).mockImplementation(() => new Promise<void>(() => undefined));
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(null);
    vi.mocked(preloadImage).mockImplementation((url: string) => Promise.resolve(url));
    useBackgroundStore.setState({
      customBackground: null,
      isLoaded: false,
      loadFailed: false,
      loadCustomBackground: realLoadCustomBackground,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals the app even when the background image never loads', async () => {
    render(<App />);

    await waitFor(() => expect(contentWrapper().className).toContain('opacity-0'));

    await vi.advanceTimersByTimeAsync(REVEAL_DEADLINE_MS * 2);

    await waitFor(() => expect(contentWrapper().className).toContain('opacity-100'));
  });

  it('reveals even while the custom-background read is still outstanding', async () => {
    // The load effect returns early until the store settles, so the deadline must be armed
    // independently — otherwise it stacks behind the store's own 3s timeout. Replacing the
    // action keeps isLoaded false for the whole test; setState alone would be overwritten.
    useBackgroundStore.setState({
      isLoaded: false,
      customBackground: null,
      loadFailed: false,
      loadCustomBackground: () => new Promise<void>(() => undefined),
    });

    render(<App />);

    await vi.advanceTimersByTimeAsync(REVEAL_DEADLINE_MS * 2);

    await waitFor(() => expect(contentWrapper().className).toContain('opacity-100'));
  });

  it('stops showing the loading spinner once the deadline passes', async () => {
    render(<App />);

    await vi.advanceTimersByTimeAsync(REVEAL_DEADLINE_MS * 2);

    await waitFor(() => expect(screen.queryByText(/Brewing your view/i)).not.toBeInTheDocument());
  });

  it('shows the photo when it does load, without waiting for the deadline', async () => {
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(PHOTO);

    render(<App />);

    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(contentWrapper().className).toContain('opacity-100'));
    // Applied AND visible — a layer stuck at opacity-0 renders the photo invisible.
    await waitFor(() => expect(photoLayer()?.className).toContain('opacity-100'));
    expect(vi.mocked(preloadImage)).toHaveBeenCalledWith(PHOTO, 5000);
  });

  it('still shows the photo when it arrives after the deadline', async () => {
    let releasePhoto: () => void = () => undefined;
    vi.mocked(preloadImages).mockReturnValue(
      new Promise<void>((resolve) => {
        releasePhoto = resolve;
      })
    );
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(PHOTO);

    render(<App />);
    await vi.advanceTimersByTimeAsync(REVEAL_DEADLINE_MS * 2);
    await waitFor(() => expect(contentWrapper().className).toContain('opacity-100'));

    // The deadline reveals the app but must not abandon the load.
    releasePhoto();
    await vi.advanceTimersByTimeAsync(50);

    await waitFor(() => expect(photoLayer()).toBeDefined());
  });
});
