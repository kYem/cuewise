import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('./hooks/usePomodoroSounds', () => ({ usePomodoroSounds: vi.fn() }));

import { installAppRenderStubs } from './__fixtures__/app-render.fixtures';
import App from './App';
import { usePomodoroSounds } from './hooks/usePomodoroSounds';
import { useSoundsStore } from './stores/sounds-store';

describe('App sounds', () => {
  beforeEach(() => {
    installAppRenderStubs();
  });

  afterEach(() => {
    window.location.hash = '';
    useSoundsStore.setState(useSoundsStore.getInitialState());
  });

  it('follows the timer from the app, not from any one page', () => {
    render(<App />);

    expect(usePomodoroSounds).toHaveBeenCalled();
  });

  it('floats a pause control over a content page while a sound plays', async () => {
    useSoundsStore.setState({
      activeSource: 'ambient',
      selectedAmbientSound: 'rain',
      isPlaying: true,
    });
    window.location.hash = 'quotes';

    render(<App />);

    expect(await screen.findByTestId('now-playing-pill')).toHaveClass('fixed');
  });
});
