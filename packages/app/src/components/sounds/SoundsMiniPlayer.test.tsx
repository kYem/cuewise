import { createSelectorMock } from '@cuewise/test-utils';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../../stores/settings-store';
import { useSoundsStore } from '../../stores/sounds-store';
import { SoundsMiniPlayer } from './SoundsMiniPlayer';

vi.mock('../../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../../stores/sounds-store', () => ({ useSoundsStore: vi.fn() }));
vi.mock('./SoundsPanel', () => ({ SoundsPanel: () => null }));

// `accent` is not a colour in this theme, so any utility naming it renders unstyled.
const UNDEFINED_ACCENT = /^(?:[a-z-]+:)*(?:bg|text|border|ring|from|via|to)-accent(?:\/\d+)?$/;

function mockStores({ isPlaying = false } = {}) {
  vi.mocked(useSettingsStore).mockReturnValue({
    settings: { ...defaultSettings, pomodoroMusicEnabled: true },
  } as unknown as ReturnType<typeof useSettingsStore>);
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

    expect(screen.getByRole('slider')).toHaveClass('bg-white/20');
    expect(screen.getByTitle('Play')).toHaveClass('bg-black/40');
  });

  it('uses theme tokens on the surface variant, so a light page stays readable', () => {
    mockStores();

    render(<SoundsMiniPlayer variant="surface" />);

    expect(screen.getByRole('slider')).toHaveClass('bg-divider');
    expect(screen.getByTitle('Play')).toHaveClass('bg-surface-variant');
    expect(screen.getByTitle('Play')).not.toHaveClass('bg-black/40');
  });

  it('keeps the playing indicator visible over a photo rather than on theme fill', () => {
    mockStores({ isPlaying: true });

    render(<SoundsMiniPlayer />);

    // The Glass theme overrides bg-primary-600 to translucent black — invisible on a photo.
    expect(renderedClasses(screen.getByTestId('playing-indicator'))).not.toContain(
      'bg-primary-600'
    );
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
