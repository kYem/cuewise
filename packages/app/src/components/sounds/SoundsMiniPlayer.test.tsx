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

function mockStores() {
  vi.mocked(useSettingsStore).mockReturnValue({
    settings: { ...defaultSettings, pomodoroMusicEnabled: true },
  } as unknown as ReturnType<typeof useSettingsStore>);
  vi.mocked(useSoundsStore).mockImplementation(
    createSelectorMock({
      activeSource: 'ambient',
      isPlaying: false,
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

function volumeSlider() {
  return screen.getByRole('slider');
}

describe('SoundsMiniPlayer chrome variant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStores();
  });

  it('uses white-on-dark chrome by default, for the glass photo behind it', () => {
    render(<SoundsMiniPlayer />);

    expect(volumeSlider()).toHaveClass('bg-white/20');
  });

  it('uses theme tokens on the surface variant, so a light page stays readable', () => {
    render(<SoundsMiniPlayer variant="surface" />);

    expect(volumeSlider()).toHaveClass('bg-divider');
    expect(volumeSlider()).not.toHaveClass('bg-white/20');
  });

  it('never styles anything with the undefined accent colour', () => {
    const { container } = render(<SoundsMiniPlayer variant="surface" />);

    const accented = container.querySelectorAll('[class*="accent-accent"], [class*="bg-accent"]');
    expect(accented).toHaveLength(0);
  });
});
