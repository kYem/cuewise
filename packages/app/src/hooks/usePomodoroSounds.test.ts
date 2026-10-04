import { createSelectorMock, createSettingsStoreMock } from '@cuewise/test-utils';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePomodoroStorageSync, usePomodoroStore } from '../stores/pomodoro-store';
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
  status?: 'idle' | 'running' | 'paused';
  sessionType?: 'work' | 'break' | 'longBreak';
  timerLoading?: boolean;
  isLeader?: boolean;
  autoStart?: boolean;
}

const sounds = { pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), initialize: vi.fn() };

function mockStores(options: MockOptions = {}) {
  vi.mocked(usePomodoroStore).mockImplementation(
    createSelectorMock({
      status: options.status ?? 'running',
      sessionType: options.sessionType ?? 'work',
      isLoading: options.timerLoading ?? false,
    })
  );
  vi.mocked(useSettingsStore).mockImplementation(
    createSettingsStoreMock({
      pomodoroMusicEnabled: true,
      pomodoroMusicAutoStart: options.autoStart ?? true,
      pomodoroMusicPlayDuringBreaks: false,
    })
  );
  vi.mocked(useSoundsStore).mockImplementation(
    createSelectorMock({
      activeSource: 'youtube',
      isLeader: options.isLeader ?? true,
      ...sounds,
    })
  );
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
    expect(sounds.initialize).toHaveBeenCalled();
  });

  it('resumes sound while a work session runs', () => {
    mockStores({ status: 'running' });

    renderHook(() => usePomodoroSounds());

    expect(sounds.resume).toHaveBeenCalled();
  });

  it('pauses sound when the timer pauses', () => {
    mockStores({ status: 'paused' });

    renderHook(() => usePomodoroSounds());

    expect(sounds.pause).toHaveBeenCalled();
  });

  it('stops sound once the timer is idle', () => {
    mockStores({ status: 'idle' });

    renderHook(() => usePomodoroSounds());

    expect(sounds.stop).toHaveBeenCalled();
  });

  it('waits for the timer to load, so a session the last tab left running does not start music', () => {
    mockStores({ status: 'running', timerLoading: true });

    renderHook(() => usePomodoroSounds());

    expect(sounds.resume).not.toHaveBeenCalled();
  });

  it('takes over once this tab wins the election', () => {
    mockStores({ isLeader: false });
    const { rerender } = renderHook(() => usePomodoroSounds());
    expect(sounds.resume).not.toHaveBeenCalled();

    mockStores({ isLeader: true });
    rerender();

    expect(sounds.resume).toHaveBeenCalled();
  });

  it('leaves sound alone in a tab that does not hold the audio', () => {
    mockStores({ isLeader: false, status: 'idle' });

    renderHook(() => usePomodoroSounds());

    expect(sounds.stop).not.toHaveBeenCalled();
  });

  it('leaves sound alone with auto-start off', () => {
    mockStores({ autoStart: false, status: 'idle' });

    renderHook(() => usePomodoroSounds());

    expect(sounds.stop).not.toHaveBeenCalled();
  });
});
