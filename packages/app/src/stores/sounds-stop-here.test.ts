import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { youtubePlayer } from '../services/youtube-player';
import { ambientSoundPlayer } from '../utils/ambient-sounds';
import { useSoundsStore } from './sounds-store';

describe('stopHere', () => {
  beforeEach(() => {
    vi.spyOn(ambientSoundPlayer, 'stop').mockImplementation(() => undefined);
    vi.spyOn(youtubePlayer, 'stop').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useSoundsStore.setState(useSoundsStore.getInitialState());
  });

  it('stops an ambient sound this tab is playing', () => {
    vi.spyOn(ambientSoundPlayer, 'getIsPlaying').mockReturnValue(true);
    useSoundsStore.setState({
      activeSource: 'ambient',
      selectedAmbientSound: 'rain',
      isPlaying: true,
    });

    useSoundsStore.getState().stopHere();

    expect(ambientSoundPlayer.stop).toHaveBeenCalled();
    expect(useSoundsStore.getState().isPlaying).toBe(false);
  });

  it('leaves an ambient sound another tab is playing', () => {
    vi.spyOn(ambientSoundPlayer, 'getIsPlaying').mockReturnValue(false);
    useSoundsStore.setState({
      activeSource: 'ambient',
      selectedAmbientSound: 'rain',
      isPlaying: true,
    });

    useSoundsStore.getState().stopHere();

    expect(useSoundsStore.getState().isPlaying).toBe(true);
  });

  it('leaves an ambient sound already fading out from an earlier stop', () => {
    vi.spyOn(ambientSoundPlayer, 'getIsPlaying').mockReturnValue(true);
    useSoundsStore.setState({
      activeSource: 'ambient',
      selectedAmbientSound: 'rain',
      isPlaying: false,
    });

    useSoundsStore.getState().stopHere();

    expect(ambientSoundPlayer.stop).not.toHaveBeenCalled();
  });

  it('stops YouTube when this tab plays it', () => {
    useSoundsStore.setState({ activeSource: 'youtube', isLeader: true, isPlaying: true });

    useSoundsStore.getState().stopHere();

    expect(youtubePlayer.stop).toHaveBeenCalled();
    expect(useSoundsStore.getState().isPlaying).toBe(false);
  });

  it('leaves YouTube another tab is playing', () => {
    useSoundsStore.setState({ activeSource: 'youtube', isLeader: false, isPlaying: true });

    useSoundsStore.getState().stopHere();

    expect(useSoundsStore.getState().isPlaying).toBe(true);
  });
});
