import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../../stores/settings-store';
import { useSoundsStore } from '../../stores/sounds-store';
import { SoundsMiniPlayer } from './SoundsMiniPlayer';

vi.mock('../../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../../stores/sounds-store', () => ({ useSoundsStore: vi.fn() }));
vi.mock('./SoundsPanel', () => ({ SoundsPanel: () => null }));

// `accent` is not a colour in this theme, so any utility naming it renders unstyled.
const UNDEFINED_ACCENT =
  /^(?:[a-z-]+:)*(?:accent|bg|text|border|divide|outline|ring|fill|stroke|shadow|from|via|to)-accent(?:\/\d+)?$/;

function mockStores({ isPlaying = false } = {}) {
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({ pomodoroMusicEnabled: true })
  );
  vi.mocked(useSoundsStore).mockImplementation(
    createSelectorMock({
      activeSource: 'ambient',
      isPlaying,
      selectedAmbientSound: 'rain',
      ambientVolume: 50,
      youtubeVolume: 50,
      isPanelOpen: false,
      togglePlayPause: vi.fn(),
      setAmbientVolume: vi.fn(),
      setYoutubeVolume: vi.fn(),
      openPanel: vi.fn(),
      closePanel: vi.fn(),
      getSelectedPlaylist: vi.fn(() => null),
      getActiveSourceName: vi.fn(() => 'Rain'),
    })
  );
}

function renderedClasses(container: HTMLElement) {
  return [...container.querySelectorAll('[class]')].flatMap(
    (el) => el.getAttribute('class')?.split(/\s+/) ?? []
  );
}

describe('SoundsMiniPlayer chrome variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses white-on-dark chrome by default, for the glass photo behind it', () => {
    mockStores();

    render(<SoundsMiniPlayer />);

    expect(screen.getByTitle('Play')).toHaveClass('bg-black/40');
  });

  it('uses theme tokens on the surface variant, so a light page stays readable', () => {
    mockStores();

    render(<SoundsMiniPlayer variant="surface" />);

    expect(screen.getByTitle('Play')).toHaveClass('bg-surface-variant');
    expect(screen.getByTitle('Play')).not.toHaveClass('bg-black/40');
  });

  // FocusMode renders the overlay variant over a photo on every theme, so its ring
  // must not fall back to the theme's own primary scale.
  it.each([
    [undefined, 'hover:ring-white/90'],
    ['surface', 'hover:ring-primary-700'],
  ] as const)('keeps the thumbnail ring on the chrome (variant: %s)', (variant, ring) => {
    mockStores();

    render(<SoundsMiniPlayer variant={variant} />);

    expect(screen.getByTitle('Open sounds panel')).toHaveClass(ring);
  });

  it.each([
    [undefined, 'bg-black/40'],
    ['surface', 'bg-surface/80'],
  ] as const)('gives the ambient thumbnail the chrome fill (variant: %s)', (variant, fill) => {
    mockStores();

    render(<SoundsMiniPlayer variant={variant} />);

    expect(screen.getByTitle('Open sounds panel').firstElementChild).toHaveClass(fill);
  });

  // The Glass theme overrides bg-primary-600 to translucent black — invisible on a photo.
  it('keeps the playing indicator visible over a photo rather than on theme fill', () => {
    mockStores({ isPlaying: true });

    render(<SoundsMiniPlayer />);

    const indicator = renderedClasses(screen.getByTestId('playing-indicator'));
    expect(indicator).toContain('bg-white');
    expect(indicator).not.toContain('bg-primary-600');
  });

  it('marks the play button as playing without the fill the glass theme flattens', () => {
    mockStores({ isPlaying: true });

    render(<SoundsMiniPlayer />);

    expect(screen.getByTitle('Pause')).toHaveClass('bg-white/25');
    expect(screen.getByTitle('Pause')).not.toHaveClass('bg-primary-600');
  });

  it('fills the playing button with the theme colour on the surface variant', () => {
    mockStores({ isPlaying: true });

    render(<SoundsMiniPlayer variant="surface" />);

    expect(screen.getByTitle('Pause')).toHaveClass('bg-primary-600');
  });

  it('tints the playing indicator with the theme on the surface variant', () => {
    mockStores({ isPlaying: true });

    render(<SoundsMiniPlayer variant="surface" />);

    expect(renderedClasses(screen.getByTestId('playing-indicator'))).toContain('bg-primary-600');
  });

  it.each([
    undefined,
    'surface',
  ] as const)('names no undefined accent colour (variant: %s)', (variant) => {
    mockStores({ isPlaying: true });

    const { container } = render(<SoundsMiniPlayer variant={variant} />);

    expect(renderedClasses(container).filter((c) => UNDEFINED_ACCENT.test(c))).toEqual([]);
  });
});
