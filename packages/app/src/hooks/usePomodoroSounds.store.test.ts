import { createSelectorMock } from '@cuewise/test-utils';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { youtubePlayer } from '../services/youtube-player';
import { persistedAmbientPlayback } from '../stores/__fixtures__/sounds-store.fixtures';
import { usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { useSoundsStore } from '../stores/sounds-store';
import { ambientSoundPlayer } from '../utils/ambient-sounds';
import { usePomodoroSounds } from './usePomodoroSounds';

vi.mock('../stores/pomodoro-store', () => ({
  usePomodoroStore: vi.fn(),
  usePomodoroStorageSync: vi.fn(),
}));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('./useSoundsLeader', () => ({ useSoundsLeader: vi.fn() }));
vi.mock('@cuewise/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cuewise/storage')>()),
  getCustomYoutubePlaylists: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../stores/toast-store', () => ({
  useToastStore: { getState: () => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }) },
}));

describe('usePomodoroSounds with the real sounds store', () => {
  afterEach(() => {
    useSoundsStore.setState(useSoundsStore.getInitialState());
  });

  it('restarts ambient a closed leader took with it once a session is running', () => {
    vi.mocked(usePomodoroStore).mockImplementation(
      createSelectorMock({
        status: 'running',
        sessionType: 'work',
        isLoading: false,
        error: null,
        initialize: vi.fn(),
      })
    );
    vi.mocked(useSettingsStore).mockImplementation(
      createSelectorMock({
        settings: { ...defaultSettings, pomodoroMusicEnabled: true, pomodoroMusicAutoStart: true },
        initialize: vi.fn(),
      })
    );
    vi.spyOn(youtubePlayer, 'initialize').mockImplementation(() => {});
    const play = vi.spyOn(ambientSoundPlayer, 'play').mockImplementation(() => {});
    persistedAmbientPlayback();
    renderHook(() => usePomodoroSounds());

    act(() => {
      useSoundsStore.getState().setIsLeader(true, { fresh: false, ambientSounding: false });
    });

    expect(play).toHaveBeenCalledWith('rain', expect.any(Number));
  });
});
