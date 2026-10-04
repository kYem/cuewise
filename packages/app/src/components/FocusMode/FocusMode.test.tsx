import { createSelectorMock } from '@cuewise/test-utils';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFocusModeStore } from '../../stores/focus-mode-store';
import { useSettingsStore } from '../../stores/settings-store';
import { FocusMode } from './FocusMode';

vi.mock('../../stores/focus-mode-store', () => ({ useFocusModeStore: vi.fn() }));
vi.mock('../../stores/settings-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stores/settings-store')>()),
  useSettingsStore: vi.fn(),
}));
vi.mock('../sounds', () => ({
  SoundsMiniPlayer: () => <div data-testid="sounds-mini-player" />,
  NowPlayingPill: () => <div data-testid="now-playing-pill" />,
}));
vi.mock('./BackgroundImage', () => ({ BackgroundImage: () => null }));
vi.mock('./FocusModeTimer', () => ({ FocusModeTimer: () => null }));
vi.mock('./FocusModeGoal', () => ({ FocusModeGoal: () => null }));
vi.mock('./FocusModeQuote', () => ({ FocusModeQuote: () => null }));
vi.mock('./FocusModeControls', () => ({ FocusModeControls: () => null }));

function renderFocusMode(pomodoroMusicEnabled: boolean) {
  vi.mocked(useFocusModeStore).mockImplementation(
    createSelectorMock({
      isActive: true,
      exitFocusMode: vi.fn(),
      currentImageUrl: null,
      isImageLoading: false,
    })
  );
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({ settings: { ...defaultSettings, pomodoroMusicEnabled }, preview: null })
  );
  render(<FocusMode />);
}

describe('FocusMode sound control', () => {
  it('shows the full player while focus music is on', () => {
    renderFocusMode(true);

    expect(screen.getByTestId('sounds-mini-player')).toBeInTheDocument();
    expect(screen.queryByTestId('now-playing-pill')).not.toBeInTheDocument();
  });

  it('keeps a pause control for a sound still playing once focus music is off', () => {
    renderFocusMode(false);

    expect(screen.getByTestId('now-playing-pill')).toBeInTheDocument();
    expect(screen.queryByTestId('sounds-mini-player')).not.toBeInTheDocument();
  });
});
