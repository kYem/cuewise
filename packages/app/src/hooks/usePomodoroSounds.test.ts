import type { SoundSource } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type SessionType,
  type TimerStatus,
  usePomodoroStorageSync,
  usePomodoroStore,
} from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { useSoundsStorageSync, useSoundsStore } from '../stores/sounds-store';
import { usePomodoroSounds } from './usePomodoroSounds';
import { useSoundsLeader } from './useSoundsLeader';

vi.mock('../stores/pomodoro-store', () => ({
  usePomodoroStore: vi.fn(),
  usePomodoroStorageSync: vi.fn(),
}));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/sounds-store', () => ({
  useSoundsStore: vi.fn(),
  useSoundsStorageSync: vi.fn(),
}));
vi.mock('./useSoundsLeader', () => ({ useSoundsLeader: vi.fn() }));

interface MockOptions {
  status?: TimerStatus;
  sessionType?: SessionType;
  timerLoading?: boolean;
  timerError?: string | null;
  isLeader?: boolean;
  musicEnabled?: boolean;
  autoStart?: boolean;
  playDuringBreaks?: boolean;
  activeSource?: SoundSource;
  isPlaying?: boolean;
}

const sounds = { pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), initialize: vi.fn() };
const initTimer = vi.fn();
const initSettings = vi.fn();

function mockStores(options: MockOptions = {}) {
  vi.mocked(usePomodoroStore).mockImplementation(
    createSelectorMock({
      status: options.status ?? 'running',
      sessionType: options.sessionType ?? 'work',
      isLoading: options.timerLoading ?? false,
      error: options.timerError ?? null,
      initialize: initTimer,
    })
  );
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({
      settings: {
        ...defaultSettings,
        pomodoroMusicEnabled: options.musicEnabled ?? true,
        pomodoroMusicAutoStart: options.autoStart ?? true,
        pomodoroMusicPlayDuringBreaks: options.playDuringBreaks ?? false,
      },
      initialize: initSettings,
    })
  );
  vi.mocked(useSoundsStore).mockImplementation(
    createSelectorMock({
      activeSource: options.activeSource ?? 'youtube',
      isLeader: options.isLeader ?? true,
      isPlaying: options.isPlaying ?? false,
      ...sounds,
    })
  );
}

/** Renders with `from`, then moves to `to` with mocks cleared, so only the move's calls count. */
function transition(from: MockOptions, to: MockOptions) {
  mockStores(from);
  const { rerender } = renderHook(() => usePomodoroSounds());
  vi.clearAllMocks();
  mockStores(to);
  rerender();
}

describe('usePomodoroSounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the sounds election and both storage syncs', () => {
    mockStores();

    renderHook(() => usePomodoroSounds());

    expect(useSoundsLeader).toHaveBeenCalled();
    expect(useSoundsStorageSync).toHaveBeenCalled();
    expect(usePomodoroStorageSync).toHaveBeenCalled();
  });

  it('loads the timer, settings and sounds itself, since a page that never does can hold the audio', () => {
    mockStores();

    renderHook(() => usePomodoroSounds());

    expect(initTimer).toHaveBeenCalled();
    expect(initSettings).toHaveBeenCalled();
    expect(sounds.initialize).toHaveBeenCalled();
  });

  it('brings the music in for a work session already running', () => {
    mockStores({ status: 'running' });

    renderHook(() => usePomodoroSounds());

    expect(sounds.resume).toHaveBeenCalled();
  });

  it('pauses sound when the timer pauses', () => {
    transition({ status: 'running' }, { status: 'paused' });

    expect(sounds.pause).toHaveBeenCalled();
  });

  it('resumes sound when the timer resumes', () => {
    transition({ status: 'paused' }, { status: 'running' });

    expect(sounds.resume).toHaveBeenCalled();
  });

  it('stops sound when the session ends', () => {
    transition({ status: 'running' }, { status: 'idle' });

    expect(sounds.stop).toHaveBeenCalled();
  });

  it('pauses sound for a break when it should not play during breaks', () => {
    transition({ sessionType: 'work' }, { sessionType: 'break' });

    expect(sounds.pause).toHaveBeenCalled();
  });

  it('keeps sound playing into a break when it should play during breaks', () => {
    transition(
      { sessionType: 'work', playDuringBreaks: true },
      { sessionType: 'break', playDuringBreaks: true }
    );

    expect(sounds.pause).not.toHaveBeenCalled();
  });

  it('does not silence a sound picked while the timer is idle', () => {
    transition(
      { status: 'idle', activeSource: 'none' },
      { status: 'idle', activeSource: 'ambient' }
    );

    expect(sounds.stop).not.toHaveBeenCalled();
  });

  it('does not stop music handed over while the timer is idle', () => {
    transition({ status: 'idle', isLeader: false }, { status: 'idle', isLeader: true });

    expect(sounds.stop).not.toHaveBeenCalled();
  });

  it('brings the music back in after this tab regains the audio', () => {
    mockStores({ status: 'running' });
    const { rerender } = renderHook(() => usePomodoroSounds());
    mockStores({ status: 'running', isLeader: false });
    rerender();
    vi.clearAllMocks();

    mockStores({ status: 'running' });
    rerender();

    expect(sounds.resume).toHaveBeenCalled();
  });

  it('waits for the timer to load, so a session the last tab left running does not start music', () => {
    mockStores({ status: 'running', timerLoading: true });

    renderHook(() => usePomodoroSounds());

    expect(sounds.resume).not.toHaveBeenCalled();
  });

  it('does not follow a timer that failed to load', () => {
    mockStores({ status: 'running', timerError: 'Failed to load pomodoro data.' });

    renderHook(() => usePomodoroSounds());

    expect(sounds.resume).not.toHaveBeenCalled();
  });

  it('does not resume again when another page reloads the timer, so a user pause sticks', () => {
    mockStores({ status: 'running' });
    const { rerender } = renderHook(() => usePomodoroSounds());
    mockStores({ status: 'running', timerLoading: true });
    rerender();
    vi.clearAllMocks();

    mockStores({ status: 'running' });
    rerender();

    expect(sounds.resume).not.toHaveBeenCalled();
  });

  it('leaves sound alone in a tab that does not hold the audio', () => {
    transition({ status: 'running', isLeader: false }, { status: 'idle', isLeader: false });

    expect(sounds.stop).not.toHaveBeenCalled();
  });

  it('does not start a sound already playing in the tab that picked it a second time', () => {
    transition(
      { status: 'running', activeSource: 'none' },
      { status: 'running', activeSource: 'ambient', isPlaying: true }
    );

    expect(sounds.resume).not.toHaveBeenCalled();
  });

  it('restarts ambient on taking over, since it most likely died with the tab that left', () => {
    transition(
      { status: 'running', activeSource: 'ambient', isPlaying: true, isLeader: false },
      { status: 'running', activeSource: 'ambient', isPlaying: true, isLeader: true }
    );

    expect(sounds.resume).toHaveBeenCalled();
  });

  it('leaves a handed-over playlist to the handover, which already resumes it', () => {
    transition(
      { status: 'running', activeSource: 'youtube', isPlaying: true, isLeader: false },
      { status: 'running', activeSource: 'youtube', isPlaying: true, isLeader: true }
    );

    expect(sounds.resume).not.toHaveBeenCalled();
  });

  it('lets a pause from the pill stick through a running session', () => {
    transition({ status: 'running', isPlaying: true }, { status: 'running', isPlaying: false });

    expect(sounds.resume).not.toHaveBeenCalled();
  });

  it('follows the timer again once a failed load is retried successfully', () => {
    mockStores({ status: 'running', timerError: 'Failed to load pomodoro data.' });
    const { rerender } = renderHook(() => usePomodoroSounds());
    mockStores({ status: 'running', timerLoading: true });
    rerender();
    vi.clearAllMocks();

    mockStores({ status: 'running' });
    rerender();

    expect(sounds.resume).toHaveBeenCalled();
  });

  it('keeps following the timer after a later save fails', () => {
    transition(
      { status: 'running' },
      { status: 'paused', timerError: 'Failed to save the session.' }
    );

    expect(sounds.pause).toHaveBeenCalled();
  });

  it('does not silence a sound picked while idle after the last one was turned off mid-session', () => {
    mockStores({ status: 'running', activeSource: 'ambient' });
    const { rerender } = renderHook(() => usePomodoroSounds());
    mockStores({ status: 'running', activeSource: 'none' });
    rerender();
    mockStores({ status: 'idle', activeSource: 'none' });
    rerender();
    vi.clearAllMocks();

    mockStores({ status: 'idle', activeSource: 'ambient' });
    rerender();

    expect(sounds.stop).not.toHaveBeenCalled();
  });

  it('leaves sound alone with music turned off', () => {
    mockStores({ status: 'running', musicEnabled: false });

    renderHook(() => usePomodoroSounds());

    expect(sounds.resume).not.toHaveBeenCalled();
  });

  it('leaves sound alone with auto-start off', () => {
    transition({ status: 'running', autoStart: false }, { status: 'idle', autoStart: false });

    expect(sounds.stop).not.toHaveBeenCalled();
  });
});
