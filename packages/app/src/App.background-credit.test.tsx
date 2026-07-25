import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The URL is inlined rather than shared: vi.mock factories are hoisted above every import,
// so they cannot read a fixture binding. It must satisfy isUnsplashUrl's prefix check.
vi.mock('./utils/image-preload-cache', () => ({
  preloadImages: vi.fn(() => Promise.resolve()),
  getPreloadedCurrentUrl: vi.fn(() => 'https://images.unsplash.com/photo-ok'),
  refreshBackground: vi.fn(() => Promise.resolve(null)),
  setCustomBackgroundOverride: vi.fn(),
  getCustomBackgroundOverride: vi.fn(() => null),
}));
vi.mock('./utils/unsplash', () => ({
  // Returns a promise like the real export; a bare vi.fn() resolves to undefined and any
  // consumer that chains rather than awaits dies with an unrelated "reading 'then'".
  loadImageWithFallback: vi.fn(() => Promise.resolve('https://images.unsplash.com/photo-ok')),
  preloadImage: vi.fn((url: string) => Promise.resolve(url)),
  getPhotoCredit: vi.fn(() => ({
    photographer: null,
    photographerUrl: null,
    sourceUrl: 'https://unsplash.com',
  })),
  isUnsplashUrl: vi.fn(() => true),
}));

import { installAppRenderStubs, waitForPhotoVisible } from './__fixtures__/app-render.fixtures';
import App from './App';
import { useBackgroundStore } from './stores/background-store';

// The credit sits in the bottom-left over whatever page is showing, so where it renders is
// a routing decision (App.tsx PHOTO_FORWARD_PAGES), not something the component can decide.
describe('background credit placement', () => {
  beforeEach(() => {
    installAppRenderStubs();
    // Set here, not cleared in afterEach: each case states its own page, and writing the hash
    // while App is still mounted would fire hashchange into a teardown-time render.
    window.location.hash = '';
    useBackgroundStore.setState({ customBackground: null, isLoaded: true, loadFailed: false });
  });

  afterEach(() => {
    useBackgroundStore.setState({ customBackground: null, isLoaded: false, loadFailed: false });
    vi.restoreAllMocks();
  });

  it.each([
    { page: 'the new tab', hash: '' },
    { page: 'Pomodoro', hash: '#pomodoro' },
  ])('credits the photo and offers a fresh one on $page', async ({ hash }) => {
    window.location.hash = hash;

    render(<App />);

    await waitForPhotoVisible();
    expect(screen.getByRole('button', { name: 'New background' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unsplash' })).toBeInTheDocument();
    // The same predicate drives the scrim, so pin both or half the rule can regress unseen.
    expect(screen.queryByTestId('background-dim')).not.toBeInTheDocument();
  });

  it.each([
    { page: 'Goals', hash: '#goals' },
    { page: 'Quotes', hash: '#quotes' },
    { page: 'Insights', hash: '#insights' },
    { page: 'Concepts', hash: '#concepts' },
  ])('leaves the bottom-left corner to the content on $page', async ({ hash }) => {
    window.location.hash = hash;

    render(<App />);

    // Precondition: waits on the same `imageLoaded` the credit is gated on, so the absences
    // below fail when the gate regresses instead of passing on an unloaded photo.
    await waitForPhotoVisible();
    expect(screen.queryByRole('button', { name: 'New background' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Unsplash' })).not.toBeInTheDocument();
    // Dimming the photo is the other half of the same predicate: content must stay readable.
    expect(screen.getByTestId('background-dim')).toBeInTheDocument();
  });
});
