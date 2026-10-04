import type { SoundSource } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoundsStore } from '../../stores/sounds-store';
import { NowPlayingPill } from './NowPlayingPill';

vi.mock('../../stores/sounds-store', () => ({ useSoundsStore: vi.fn() }));

const togglePlayPause = vi.fn();

function mockSounds(state: {
  activeSource?: SoundSource;
  isPlaying?: boolean;
  isPaused?: boolean;
}) {
  vi.mocked(useSoundsStore).mockImplementation(
    createSelectorMock({
      activeSource: state.activeSource ?? 'ambient',
      isPlaying: state.isPlaying ?? false,
      isPaused: state.isPaused ?? false,
      togglePlayPause,
      getActiveSourceName: () => 'Rain',
    })
  );
}

describe('NowPlayingPill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pauses a playing sound', async () => {
    mockSounds({ isPlaying: true });
    render(<NowPlayingPill />);

    await userEvent.click(screen.getByRole('button', { name: 'Pause sound' }));

    expect(togglePlayPause).toHaveBeenCalled();
  });

  it('stays after a pause, offering to play again', () => {
    mockSounds({ isPaused: true });

    render(<NowPlayingPill />);

    expect(screen.getByRole('button', { name: 'Play sound' })).toBeInTheDocument();
  });

  it('is gone once the sound is stopped', () => {
    mockSounds({});

    render(<NowPlayingPill />);

    expect(screen.queryByTestId('now-playing-pill')).toBeNull();
  });

  it('is gone with no source chosen', () => {
    mockSounds({ activeSource: 'none', isPlaying: true });

    render(<NowPlayingPill />);

    expect(screen.queryByTestId('now-playing-pill')).toBeNull();
  });
});
