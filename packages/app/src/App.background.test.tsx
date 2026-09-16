import { logger } from '@cuewise/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A blocked CDN takes ~30s to give up below — far too long to gate the app on.
// A never-settling promise stands in for that wait.
vi.mock('./utils/image-preload-cache', () => ({
  preloadImages: vi.fn(),
  getPreloadedCurrentUrl: vi.fn(),
  refreshBackground: vi.fn(() => Promise.resolve(null)),
  setCustomBackgroundOverride: vi.fn(),
  getCustomBackgroundOverride: vi.fn(() => null),
}));
vi.mock('./utils/unsplash', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./utils/unsplash')>()),
  loadImageWithFallback: vi.fn(() => new Promise<string>(() => undefined)),
  preloadImage: vi.fn((url: string) => Promise.resolve(url)),
}));

import {
  hasPhotoApplied,
  installAppRenderStubs,
  UNSPLASH_PHOTO_URL as PHOTO,
  photoLayer,
} from './__fixtures__/app-render.fixtures';
import App from './App';
import { useBackgroundStore } from './stores/background-store';
import { useSettingsStore } from './stores/settings-store';
import {
  getPreloadedCurrentUrl,
  preloadImages,
  refreshBackground,
} from './utils/image-preload-cache';
import { ImageLoadTimeoutError, preloadImage } from './utils/unsplash';

/** Mirrors BACKGROUND_REVEAL_DEADLINE_MS in App.tsx; raising it there must fail these. */
const REVEAL_DEADLINE_MS = 1500;

/** Captured before any test stubs it, so replacing the action can't leak between tests. */
const realLoadCustomBackground = useBackgroundStore.getState().loadCustomBackground;

/** The wrapper gating the main content + theme switcher (App.tsx `hideContent`). */
function contentWrapper(): HTMLElement {
  return screen.getByTestId('app-content');
}

function resolvingAfter<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function rejectingAfter(ms: number, error: Error): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(error), ms));
}

function setColorTheme(theme: 'glass' | 'purple'): void {
  act(() => {
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, colorTheme: theme },
    }));
  });
}

/** Returning must not itself load a photo, or "nothing waiting" could not be told from "loaded". */
async function leaveGlassAndReturn(msAway: number): Promise<void> {
  setColorTheme('purple');
  await vi.advanceTimersByTimeAsync(msAway);
  vi.mocked(preloadImages).mockImplementation(() => new Promise<void>(() => undefined));
  setColorTheme('glass');
  await vi.advanceTimersByTimeAsync(100);
}

// These tests assume glass is the default theme (DEFAULT_SETTINGS.colorTheme); without it
// nothing is gated and the spinner assertions would pass vacuously.
describe('App background gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installAppRenderStubs();
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
    expect(vi.mocked(preloadImage)).toHaveBeenCalledWith(PHOTO, 60_000);
  });

  it('waits out a slow photo rather than abandoning it, the deadline having already unblocked the page', async () => {
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(PHOTO);
    // Rejects first if the limit is under 30s, so lowering BACKGROUND_LOAD_TIMEOUT_MS fails this.
    vi.mocked(preloadImage).mockImplementation(
      (url: string, timeout = 10_000) =>
        new Promise((resolve, reject) => {
          const landed = setTimeout(() => resolve(url), 30_000);
          setTimeout(() => {
            clearTimeout(landed);
            reject(new ImageLoadTimeoutError());
          }, timeout);
        })
    );

    render(<App />);
    await vi.advanceTimersByTimeAsync(30_000);

    await waitFor(() => expect(photoLayer().className).toContain('opacity-100'));
  });

  it('reports a photo that outlasts the limit as still loading, not failed, and leaves the gradient', async () => {
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(PHOTO);
    vi.mocked(preloadImage).mockRejectedValue(new ImageLoadTimeoutError());
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

    render(<App />);
    await vi.advanceTimersByTimeAsync(100);

    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('still loading'),
        expect.any(ImageLoadTimeoutError),
        expect.objectContaining({ source: PHOTO })
      )
    );
    expect(hasPhotoApplied()).toBe(false);
  });

  it('stays quiet about a load the user has already switched away from', async () => {
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(PHOTO);
    vi.mocked(preloadImage).mockImplementation(() =>
      rejectingAfter(1000, new Error('Failed to load image'))
    );
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

    render(<App />);
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.mocked(preloadImage)).toHaveBeenLastCalledWith(PHOTO, 60_000);
    setColorTheme('purple');
    expect(screen.queryByTestId('background-photo')).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);

    expect(error).not.toHaveBeenCalled();
  });

  it('drops a photo that lands after the user has left glass, so none is waiting on return', async () => {
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(PHOTO);
    vi.mocked(preloadImage).mockImplementation((url: string) => resolvingAfter(1000, url));

    render(<App />);
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.mocked(preloadImage)).toHaveBeenLastCalledWith(PHOTO, 60_000);
    await leaveGlassAndReturn(1000);

    expect(hasPhotoApplied()).toBe(false);
  });

  describe('when a refresh overlaps another change', () => {
    const first = 'https://images.unsplash.com/photo-first';
    const ocean = 'https://images.unsplash.com/photo-ocean';
    const chosen = 'https://images.unsplash.com/photo-chosen';

    async function renderWithFirstPhoto(): Promise<void> {
      window.location.hash = '';
      render(<App />);
      await vi.advanceTimersByTimeAsync(100);
      await waitFor(() => expect(photoLayer().style.backgroundImage).toContain(first));
    }

    function switchToOcean(): void {
      act(() => {
        useSettingsStore.setState((state) => ({
          settings: { ...state.settings, focusModeImageCategory: 'ocean' },
        }));
      });
    }

    async function clickRefresh(): Promise<void> {
      await act(async () => {
        screen.getByRole('button', { name: 'New background' }).click();
      });
    }

    beforeEach(() => {
      vi.mocked(preloadImages).mockResolvedValue(undefined);
      vi.mocked(getPreloadedCurrentUrl).mockImplementation((category) =>
        category === 'ocean' ? ocean : first
      );
    });

    it('applies a fresh pick after a plain refresh', async () => {
      vi.mocked(refreshBackground).mockResolvedValue(chosen);
      await renderWithFirstPhoto();

      await clickRefresh();

      await waitFor(() => expect(photoLayer().style.backgroundImage).toContain(chosen));
    });

    it('lets the refresh land while the category change that interrupted it is out, then yields', async () => {
      vi.mocked(preloadImage).mockImplementation((url: string) =>
        url === ocean ? resolvingAfter(3000, url) : Promise.resolve(url)
      );
      vi.mocked(refreshBackground).mockImplementation(() => resolvingAfter(1000, chosen));
      await renderWithFirstPhoto();

      await clickRefresh();
      switchToOcean();
      await vi.advanceTimersByTimeAsync(1000);
      expect(photoLayer().style.backgroundImage).toContain(chosen);
      await vi.advanceTimersByTimeAsync(3000);

      expect(photoLayer().style.backgroundImage).toContain(ocean);
    });

    it('keeps the refresh when the category resolve it interrupted lands afterwards', async () => {
      vi.mocked(preloadImages).mockImplementation((category) =>
        category === 'ocean' ? resolvingAfter(3000, undefined) : Promise.resolve()
      );
      vi.mocked(refreshBackground).mockResolvedValue(chosen);
      await renderWithFirstPhoto();

      switchToOcean();
      await clickRefresh();
      await waitFor(() => expect(photoLayer().style.backgroundImage).toContain(chosen));
      await vi.advanceTimersByTimeAsync(3000);

      expect(photoLayer().style.backgroundImage).toContain(chosen);
    });

    it('keeps the category change when the refresh it interrupted lands afterwards', async () => {
      vi.mocked(refreshBackground).mockImplementation(() => resolvingAfter(3000, chosen));
      await renderWithFirstPhoto();

      await clickRefresh();
      switchToOcean();
      await waitFor(() => expect(photoLayer().style.backgroundImage).toContain(ocean));
      await vi.advanceTimersByTimeAsync(3000);

      expect(photoLayer().style.backgroundImage).toContain(ocean);
    });

    it('lets the category change land after a refresh that interrupted it came back empty', async () => {
      vi.mocked(preloadImage).mockImplementation((url: string) =>
        url === ocean ? resolvingAfter(4000, url) : Promise.resolve(url)
      );
      vi.mocked(refreshBackground).mockImplementation(() => resolvingAfter(3000, null));
      await renderWithFirstPhoto();

      switchToOcean();
      await vi.advanceTimersByTimeAsync(100);
      await clickRefresh();
      await vi.advanceTimersByTimeAsync(4000);

      expect(photoLayer().style.backgroundImage).toContain(ocean);
    });

    it('lets the category change land while the refresh that interrupted it is still out', async () => {
      vi.mocked(preloadImage).mockImplementation((url: string) =>
        url === ocean ? resolvingAfter(2000, url) : Promise.resolve(url)
      );
      vi.mocked(refreshBackground).mockImplementation(() => resolvingAfter(3000, null));
      await renderWithFirstPhoto();

      switchToOcean();
      await vi.advanceTimersByTimeAsync(100);
      await clickRefresh();
      await vi.advanceTimersByTimeAsync(2000);

      expect(photoLayer().style.backgroundImage).toContain(ocean);
    });

    it('drops a refresh that lands after the user has left glass, so none is waiting on return', async () => {
      vi.mocked(refreshBackground).mockImplementation(() => resolvingAfter(3000, chosen));
      await renderWithFirstPhoto();

      await clickRefresh();
      await leaveGlassAndReturn(3000);

      expect(hasPhotoApplied()).toBe(false);
    });

    it('stays quiet about a load a refresh has already superseded', async () => {
      vi.mocked(preloadImage).mockImplementation((url: string) =>
        url === ocean ? rejectingAfter(3000, new ImageLoadTimeoutError()) : Promise.resolve(url)
      );
      vi.mocked(refreshBackground).mockResolvedValue(chosen);
      const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
      await renderWithFirstPhoto();

      switchToOcean();
      await vi.advanceTimersByTimeAsync(100);
      expect(vi.mocked(preloadImage)).toHaveBeenLastCalledWith(ocean, 60_000);
      await clickRefresh();
      await waitFor(() => expect(photoLayer().style.backgroundImage).toContain(chosen));
      await vi.advanceTimersByTimeAsync(3000);

      expect(error).not.toHaveBeenCalled();
    });
  });

  // This layer is the only one painting the photo, so it is the only place the readability
  // sliders can take effect.
  it('applies the readability filter to the photo layer', async () => {
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(PHOTO);

    render(<App />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(photoLayer().className).toContain('opacity-100'));

    act(() => {
      useSettingsStore.setState({ preview: { backgroundDim: 40, backgroundBlur: 8 } });
    });

    expect(photoLayer()).toHaveStyle({ filter: 'brightness(0.6) blur(8px)', margin: '-16px' });
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
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

    render(<App />);

    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(contentWrapper().className).toContain('opacity-100'));
    expect(hasPhotoApplied()).toBe(false);
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('Background image failed to load'),
        expect.anything(),
        expect.objectContaining({ source: PHOTO })
      )
    );
  });

  it("never logs a custom background, which is a data URL of the user's own picture", async () => {
    const ownPhoto = 'data:image/jpeg;base64,secret';
    vi.mocked(preloadImages).mockResolvedValue(undefined);
    vi.mocked(getPreloadedCurrentUrl).mockReturnValue(ownPhoto);
    vi.mocked(preloadImage).mockRejectedValue(new Error('Failed to load image'));
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});

    render(<App />);

    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(error).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ source: 'custom-background' })
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret');
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
