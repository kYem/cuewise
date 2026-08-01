import { screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { setReducedMotion } from '../components/__fixtures__/motion.fixtures';

/** Satisfies isUnsplashUrl's `images.unsplash.com` prefix check, so the credit renders. */
export const UNSPLASH_PHOTO_URL = 'https://images.unsplash.com/photo-ok';

/** jsdom has no IntersectionObserver; NewTabPage's sticky-header effect constructs one. */
class StubIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** The globals every `render(<App />)` needs beyond the shared chrome-storage mock. */
export function installAppRenderStubs(): void {
  setReducedMotion(false);
  window.IntersectionObserver = StubIntersectionObserver as unknown as typeof IntersectionObserver;
}

/** The layer always renders; only a loaded background gives it a url() and full opacity. */
export function photoLayer(): HTMLElement {
  return screen.getByTestId('background-photo');
}

export function hasPhotoApplied(): boolean {
  return (photoLayer().getAttribute('style') ?? '').includes('url(');
}

/**
 * Waits until the photo is applied *and* revealed. `opacity-100` is App's
 * `imageLoaded && backgroundImage` gate — the same `imageLoaded` the credit renders behind —
 * so an absence asserted after this can't pass merely because nothing has loaded yet.
 */
export async function waitForPhotoVisible(): Promise<void> {
  await waitFor(() => {
    expect(hasPhotoApplied()).toBe(true);
    expect(photoLayer().className).toContain('opacity-100');
  });
}
