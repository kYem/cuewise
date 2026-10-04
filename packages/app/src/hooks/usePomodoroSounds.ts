import { useEffect, useRef } from 'react';
import {
  type TimerStatus,
  usePomodoroStorageSync,
  usePomodoroStore,
} from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { useSoundsStorageSync, useSoundsStore } from '../stores/sounds-store';
import { useSoundsLeader } from './useSoundsLeader';

type TimerSound = 'resume' | 'pause' | 'stop';

function soundForTimer(
  status: TimerStatus,
  isWork: boolean,
  playDuringBreaks: boolean
): TimerSound {
  if (status === 'running') {
    if (isWork || playDuringBreaks) {
      return 'resume';
    }
    return 'pause';
  }
  if (status === 'paused') {
    return 'pause';
  }
  return 'stop';
}

/** Mounted once for the whole app, so sound follows the timer rather than the page. */
export function usePomodoroSounds(): void {
  const status = usePomodoroStore((state) => state.status);
  const sessionType = usePomodoroStore((state) => state.sessionType);
  // Until initialize() has recovered it, status is whatever the last closed tab persisted.
  const isTimerLoading = usePomodoroStore((state) => state.isLoading);
  const timerFailedToLoad = usePomodoroStore((state) => state.error !== null);
  const initTimer = usePomodoroStore((state) => state.initialize);
  const initSettings = useSettingsStore((state) => state.initialize);
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
  // Acting only when the timer's wish changes keeps a re-render (navigation reloading the timer,
  // a newly picked sound) from overriding what the user just pressed.
  const appliedRef = useRef<TimerSound | null>(null);

  usePomodoroStorageSync();
  useSoundsLeader();
  // Must be mounted wherever the election runs, or the elected tab never hears another tab's write.
  useSoundsStorageSync();

  // Any page can win the audio, and Insights/Quotes/Goals/Concepts load none of these themselves.
  useEffect(() => {
    initTimer();
    initSettings();
    initSounds();
  }, [initTimer, initSettings, initSounds]);

  useEffect(() => {
    // These follow the timer rather than the user, and they reach whichever tab holds the audio —
    // so only the tab that owns it may drive them.
    if (!isLeader) {
      appliedRef.current = null;
      return;
    }
    if (!musicEnabled || !autoStart || isTimerLoading || timerFailedToLoad) {
      return;
    }
    if (activeSource === 'none') {
      return;
    }

    const wanted = soundForTimer(status, sessionType === 'work', playDuringBreaks);
    const previous = appliedRef.current;
    appliedRef.current = wanted;
    if (wanted === previous) {
      return;
    }
    // A first look is not a transition: an idle timer must not silence a sound just picked or
    // just handed over, while a running session should still bring its music in.
    if (previous === null && wanted !== 'resume') {
      return;
    }

    if (wanted === 'resume') {
      resumeSounds();
    } else if (wanted === 'pause') {
      pauseSounds();
    } else {
      stopSounds();
    }
  }, [
    status,
    sessionType,
    isTimerLoading,
    timerFailedToLoad,
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
