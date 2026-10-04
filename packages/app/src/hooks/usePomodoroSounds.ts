import { useEffect } from 'react';
import { usePomodoroStorageSync, usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { useSoundsStorageSync, useSoundsStore } from '../stores/sounds-store';
import { useSoundsLeader } from './useSoundsLeader';

/** Mounted once for the whole app, so sound follows the timer rather than the page. */
export function usePomodoroSounds(): void {
  const status = usePomodoroStore((state) => state.status);
  const sessionType = usePomodoroStore((state) => state.sessionType);
  // Until initialize() has recovered it, status is whatever the last closed tab persisted.
  const isTimerLoading = usePomodoroStore((state) => state.isLoading);
  const musicEnabled = useSettingsStore((state) => state.settings.pomodoroMusicEnabled);
  const autoStart = useSettingsStore((state) => state.settings.pomodoroMusicAutoStart);
  const playDuringBreaks = useSettingsStore(
    (state) => state.settings.pomodoroMusicPlayDuringBreaks
  );
  const activeSource = useSoundsStore((state) => state.activeSource);
  const isLeader = useSoundsStore((state) => state.isLeader);
  const initSounds = useSoundsStore((state) => state.initialize);
  const resumeSounds = useSoundsStore((state) => state.resume);
  const pauseSounds = useSoundsStore((state) => state.pause);
  const stopSounds = useSoundsStore((state) => state.stop);

  usePomodoroStorageSync();
  useSoundsLeader();
  // Must be mounted wherever the election runs, or the elected tab never hears another tab's write.
  useSoundsStorageSync();

  useEffect(() => {
    initSounds();
  }, [initSounds]);

  useEffect(() => {
    if (!musicEnabled || !autoStart || isTimerLoading) {
      return;
    }
    // These follow the timer rather than the user, and they reach whichever tab holds the audio —
    // so only the tab that owns it may drive them.
    if (!isLeader || activeSource === 'none') {
      return;
    }

    if (status === 'running' && (sessionType === 'work' || playDuringBreaks)) {
      resumeSounds();
    } else if (status === 'paused') {
      pauseSounds();
    } else if (status === 'idle') {
      stopSounds();
    }
  }, [
    status,
    sessionType,
    isTimerLoading,
    activeSource,
    isLeader,
    musicEnabled,
    autoStart,
    playDuringBreaks,
    resumeSounds,
    pauseSounds,
    stopSounds,
  ]);
}
