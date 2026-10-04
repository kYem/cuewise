import { afterEach, describe, expect, it, vi } from 'vitest';
import { ambientSoundPlayer } from '../utils/ambient-sounds';
import { persistedAmbientPlayback } from './__fixtures__/sounds-store.fixtures';
import { useSoundsStore } from './sounds-store';

describe('playAmbient', () => {
  afterEach(() => {
    useSoundsStore.setState(useSoundsStore.getInitialState());
    vi.useRealTimers();
  });

  it('stops the sound playing in another tab instead of starting a second copy', async () => {
    vi.useFakeTimers();
    const play = vi.spyOn(ambientSoundPlayer, 'play').mockImplementation(() => {});
    vi.spyOn(ambientSoundPlayer, 'stop').mockImplementation(() => {});
    persistedAmbientPlayback();

    useSoundsStore.getState().playAmbient('rain');
    await vi.advanceTimersByTimeAsync(100);

    expect(play).not.toHaveBeenCalled();
    expect(useSoundsStore.getState()).toMatchObject({ activeSource: 'none', isPlaying: false });
  });

  it('plays a paused sound again rather than treating the click as a stop', async () => {
    vi.useFakeTimers();
    const play = vi.spyOn(ambientSoundPlayer, 'play').mockImplementation(() => {});
    persistedAmbientPlayback();
    useSoundsStore.setState({ isPlaying: false, isPaused: true });

    useSoundsStore.getState().playAmbient('rain');
    await vi.advanceTimersByTimeAsync(100);

    expect(play).toHaveBeenCalledWith('rain', useSoundsStore.getState().ambientVolume);
    expect(useSoundsStore.getState()).toMatchObject({ activeSource: 'ambient', isPlaying: true });
  });
});
