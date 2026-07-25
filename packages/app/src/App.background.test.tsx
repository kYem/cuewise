import { logger } from '@cuewise/shared';
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

import {
  hasPhotoApplied,
  installAppRenderStubs,
  UNSPLASH_PHOTO_URL as PHOTO,
  photoLayer,
} from './__fixtures__/app-render.fixtures';
import App from './App';
import { useBackgroundStore } from './stores/background-store';
import { getPreloadedCurrentUrl, preloadImages } from './utils/image-preload-cache';
import { isUnsplashUrl, preloadImage } from './utils/unsplash';

/** Mirrors BACKGROUND_REVEAL_DEADLINE_MS in App.tsx; raising it there must fail these. */
const REVEAL_DEADLINE_MS = 1500;

/** Captured before any test stubs it, so replacing the action can't leak between tests. */
const realLoadCustomBackground = useBackgroundStore.getState().loadCustomBackground;

/** The wrapper gating the main content + theme switcher (App.tsx `hideContent`). */
function contentWrapper(): HTMLElement {
  return screen.getByTestId('app-content');
}

// These tests assume glass is the default theme (DEFAULT_SETTINGS.colorTheme); without it
// nothing is gated and the spinner assertions would pass vacuously.
describe('App background gate', () => {
  beforeEach(() => {
    installAppRenderStubs();
    // Re-established per test: a leaked happy-path stub would let the app reveal via the
    // image and silently disarm the deadline tests, whatever order they run in.
    vi.mocked(preloadImages).mockImplementation(() => new Promise<void>(() => undefined));
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(null);
    vi.mocked(preloadImage).mockImplementation((url: string) => Promise.resolve(url));
    vi.mocked(isUnsplashUrl).mockReturnValue(true);
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
    vi.restoreAllMocks();
  });

  it('reveals the app even when the background image never loads', async () => {
    // Deterministic clock: shouldAdvanceTime would let real elapsed time under full-suite
    // load fire the deadline before the "still hidden" assertion. Must precede render —
    // reinstalling the clock discards pending timers — and waitFor can't be used after it.
    vi.useFakeTimers();
    render(<App />);

    // The two advances total exactly REVEAL_DEADLINE_MS, so the reveal assertion catches the
    // deadline being raised; the precondition below catches it being removed or dropped to ~0.
    await vi.advanceTimersByTimeAsync(REVEAL_DEADLINE_MS - 100);
    expect(contentWrapper().className).toContain('opacity-0');
    expect(screen.getByText(/Brewing your view/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(100);
    expect(contentWrapper().className).toContain('opacity-100');
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
    // Manual clock, before render — see the note in the reveal test above.
    vi.useFakeTimers();
    render(<App />);

    // Positive precondition first, or this can't tell "dismissed" from "never rendered".
    await vi.advanceTimersByTimeAsync(REVEAL_DEADLINE_MS - 100);
    expect(screen.getByText(/Brewing your view/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(100);
    expect(screen.queryByText(/Brewing your view/i)).not.toBeInTheDocument();
  });

  it('shows the photo when it does load, without waiting for the deadline', async () => {
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(PHOTO);

    render(<App />);

    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(contentWrapper().className).toContain('opacity-100'));
    // Applied AND visible — a layer stuck at opacity-0 renders the photo invisible.
    await waitFor(() => expect(photoLayer().className).toContain('opacity-100'));
    expect(vi.mocked(preloadImage)).toHaveBeenCalledWith(PHOTO, 5000);
  });

  it('reveals immediately when no image resolves, without waiting out the deadline', async () => {
    // The blocked-CDN case: preloadImages gives up and returns nothing.
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(null);

    render(<App />);

    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(contentWrapper().className).toContain('opacity-100'));
  });

  it('reveals over the gradient when the image rejects', async () => {
    // A custom background reaches preloadImage unvalidated, so a rejection is reachable.
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(PHOTO);
    vi.mocked(preloadImage).mockRejectedValue(new Error('Failed to load image'));
    const warn = vi.spyOn(logger, 'warn');

    render(<App />);

    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(contentWrapper().className).toContain('opacity-100'));
    expect(hasPhotoApplied()).toBe(false);
    // Asserting the log is what stops this catch quietly regressing to `catch {}`.
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Background image failed to load'),
        expect.objectContaining({ source: PHOTO })
      )
    );
  });

  it("never logs a custom background, which is a data URL of the user's own picture", async () => {
    const ownPhoto = 'data:image/jpeg;base64,secret';
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(ownPhoto);
    vi.mocked(isUnsplashUrl).mockReturnValue(false);
    vi.mocked(preloadImage).mockRejectedValue(new Error('Failed to load image'));
    const warn = vi.spyOn(logger, 'warn');

    render(<App />);

    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ source: 'custom-background' })
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
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

    await waitFor(() => expect(hasPhotoApplied()).toBe(true));
  });
});
