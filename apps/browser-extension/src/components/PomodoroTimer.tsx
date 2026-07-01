import { formatTimeRemaining, type LayoutDensity, type Settings } from '@cuewise/shared';
import {
  Check,
  ChevronDown,
  Maximize2,
  Music,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePomodoroLeader } from '../hooks/usePomodoroLeader';
import { useSoundsLeader } from '../hooks/useSoundsLeader';
import { useFocusModeStore } from '../stores/focus-mode-store';
import { useGoalStore } from '../stores/goal-store';
import { usePomodoroStorageSync, usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { useSoundsStore } from '../stores/sounds-store';
import { getSessionStyles } from '../utils/pomodoro-styles';
import { PomodoroMiniSettings } from './PomodoroMiniSettings';

// Per-density card + ring sizing. Geometry invariant per entry: center = viewBox / 2, radius < center.
const TIMER_SIZES: Record<
  LayoutDensity,
  {
    card: string;
    container: string;
    radius: number;
    center: number;
    strokeWidth: number;
    fontSize: string;
    labelSize: string;
    viewBox: string;
  }
> = {
  compact: {
    card: 'w-[300px]',
    container: 'w-40 h-40',
    radius: 73,
    center: 80,
    strokeWidth: 7,
    fontSize: 'text-3xl',
    labelSize: 'text-xs',
    viewBox: '0 0 160 160',
  },
  comfortable: {
    card: 'w-[340px]',
    container: 'w-48 h-48',
    radius: 88,
    center: 96,
    strokeWidth: 8,
    fontSize: 'text-4xl',
    labelSize: 'text-xs',
    viewBox: '0 0 192 192',
  },
  spacious: {
    card: 'w-[400px]',
    container: 'w-64 h-64',
    radius: 118,
    center: 128,
    strokeWidth: 10,
    fontSize: 'text-6xl',
    labelSize: 'text-sm',
    viewBox: '0 0 256 256',
  },
};

export const PomodoroTimer: React.FC = () => {
  // Pomodoro state - use useShallow to prevent re-renders when unrelated state changes
  const {
    status,
    sessionType,
    timeRemaining,
    totalTime,
    consecutiveWorkSessions,
    longBreakInterval,
    selectedGoalId,
  } = usePomodoroStore(
    useShallow((state) => ({
      status: state.status,
      sessionType: state.sessionType,
      timeRemaining: state.timeRemaining,
      totalTime: state.totalTime,
      consecutiveWorkSessions: state.consecutiveWorkSessions,
      longBreakInterval: state.longBreakInterval,
      selectedGoalId: state.selectedGoalId,
    }))
  );

  // Pomodoro actions - stable references
  const initialize = usePomodoroStore((state) => state.initialize);
  const start = usePomodoroStore((state) => state.start);
  const pause = usePomodoroStore((state) => state.pause);
  const resume = usePomodoroStore((state) => state.resume);
  const reset = usePomodoroStore((state) => state.reset);
  const skip = usePomodoroStore((state) => state.skip);
  const setSelectedGoal = usePomodoroStore((state) => state.setSelectedGoal);
  const reloadSettings = usePomodoroStore((state) => state.reloadSettings);

  // Goal state and actions
  const todayTasks = useGoalStore((state) => state.todayTasks);
  const initGoals = useGoalStore((state) => state.initialize);

  // Settings state and actions
  const settings = useSettingsStore(useShallow((state) => state.settings));
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  // Single write path for preset taps and per-field edits: persist the patch
  // (updateSettings merges it), then reloadSettings so the running timer picks up the
  // new durations. Called fire-and-forget from the popover — safe only because both
  // callees catch + toast internally and never reject.
  const handleApplyTimerSettings = useCallback(
    async (patch: Partial<Settings>) => {
      await updateSettings(patch);
      await reloadSettings();
    },
    [updateSettings, reloadSettings]
  );

  // Sounds state - use useShallow for multiple values
  const { activeSource, isPlaying: isSoundsPlaying } = useSoundsStore(
    useShallow((state) => ({
      activeSource: state.activeSource,
      isPlaying: state.isPlaying,
    }))
  );

  // Sounds actions - stable references
  const pauseSounds = useSoundsStore((state) => state.pause);
  const resumeSounds = useSoundsStore((state) => state.resume);
  const stopSounds = useSoundsStore((state) => state.stop);
  const initSounds = useSoundsStore((state) => state.initialize);
  const getActiveSourceName = useSoundsStore((state) => state.getActiveSourceName);

  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const goalPickerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [titleFaded, setTitleFaded] = useState(false);

  // Close the goal dropdown when clicking outside it
  useEffect(() => {
    if (!showGoalPicker) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (goalPickerRef.current && !goalPickerRef.current.contains(event.target as Node)) {
        setShowGoalPicker(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [showGoalPicker]);

  // Enable cross-tab synchronization
  usePomodoroStorageSync();

  // Timer leader election - only one tab/component runs the timer
  usePomodoroLeader();

  // Sounds leader election - only one tab plays YouTube audio
  useSoundsLeader();

  // Initialize on mount
  useEffect(() => {
    initialize();
    initGoals();
    initSounds();
  }, [initialize, initGoals, initSounds]);

  // Unified sound management (ambient + YouTube via sounds-store)
  // The sounds-store handles leader election and cross-tab sync internally
  useEffect(() => {
    const { pomodoroMusicEnabled, pomodoroMusicAutoStart, pomodoroMusicPlayDuringBreaks } =
      settings;

    // Skip if sounds feature is disabled or auto-start is off
    if (!pomodoroMusicEnabled || !pomodoroMusicAutoStart) {
      return;
    }

    // Skip if no sound source is selected
    if (activeSource === 'none') {
      return;
    }

    // Determine if we should play sounds based on session type
    const shouldPlayForSession = sessionType === 'work' || pomodoroMusicPlayDuringBreaks;

    if (status === 'running' && shouldPlayForSession) {
      // Resume sounds when timer is running
      resumeSounds();
    } else if (status === 'paused') {
      // Pause sounds when timer is paused
      pauseSounds();
    } else if (status === 'idle') {
      // Stop sounds when timer is idle
      stopSounds();
    }

    // Cleanup on unmount
    return () => {
      stopSounds();
    };
  }, [
    status,
    sessionType,
    activeSource,
    settings.pomodoroMusicEnabled,
    settings.pomodoroMusicAutoStart,
    settings.pomodoroMusicPlayDuringBreaks,
    resumeSounds,
    pauseSounds,
    stopSounds,
  ]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const progress = totalTime > 0 ? ((totalTime - timeRemaining) / totalTime) * 100 : 0;

  const isWork = sessionType === 'work';

  // Get session-specific styles
  const { color, bgColor, progressColor, label, icon: SessionIcon } = getSessionStyles(sessionType);

  // Find selected goal
  const selectedGoal = todayTasks.find((g) => g.id === selectedGoalId);

  // Header title: the chosen goal (fitted into two lines by the title effect below) or session label
  const headerTitle = selectedGoal ? selectedGoal.text : label;

  // Today's incomplete tasks, shown in the goal picker
  const activeGoals = todayTasks.filter((g) => !g.completed);

  // Calculate sessions until long break
  const sessionsUntilLongBreak = longBreakInterval - consecutiveWorkSessions;

  // Get density-aware sizing
  const density = settings.layoutDensity;
  const timerSize = TIMER_SIZES[density];

  // Fit the goal title into two lines: shrink 16px → 11.5px; if it still overflows, fade the bottom edge
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) {
      return;
    }
    let overflows = true;
    for (const size of [16, 14, 12.5, 11.5]) {
      el.style.fontSize = `${size}px`;
      if (el.scrollHeight <= el.clientHeight + 1) {
        overflows = false;
        break;
      }
    }
    setTitleFaded(overflows);
    // isWork: the work title node unmounts during breaks; re-run the fit when it remounts
  }, [headerTitle, density, isWork]);

  return (
    <div className={`${timerSize.card} max-w-[92vw] mx-auto`}>
      <div className="bg-black/25 backdrop-blur-md rounded-2xl shadow-lg p-density-lg border border-white/10">
        {/* Header - icon + goal picker (work) or session label (break). During work
            the title IS the goal selector: the chosen goal or "Focus Session" + a
            chevron opening today's goals; Clear lives inside that dropdown. */}
        <div ref={goalPickerRef} className="relative mb-density-md">
          <div className="flex items-center gap-density-sm">
            <div className={`p-2 ${bgColor} rounded-lg flex-shrink-0`}>
              <SessionIcon className={`w-5 h-5 ${color}`} />
            </div>

            {isWork ? (
              <button
                type="button"
                onClick={() => setShowGoalPicker(!showGoalPicker)}
                className="flex flex-1 min-w-0 items-center gap-1.5 text-left"
                title={selectedGoal ? 'Change goal' : 'Select a goal'}
                aria-haspopup="menu"
                aria-expanded={showGoalPicker}
              >
                <h2
                  ref={titleRef}
                  className="min-w-0 flex-1 font-semibold text-white"
                  style={{
                    lineHeight: 1.2,
                    maxHeight: '2.4em',
                    overflow: 'hidden',
                    overflowWrap: 'anywhere',
                    ...(titleFaded
                      ? {
                          maskImage: 'linear-gradient(to bottom, #000 60%, transparent)',
                          WebkitMaskImage: 'linear-gradient(to bottom, #000 60%, transparent)',
                        }
                      : {}),
                  }}
                >
                  {headerTitle}
                </h2>
                <ChevronDown
                  className={`w-4 h-4 text-white/60 flex-shrink-0 transition-transform ${
                    showGoalPicker ? 'rotate-180' : ''
                  }`}
                />
              </button>
            ) : (
              <h2 className="text-lg font-semibold text-white flex-1 min-w-0 truncate">{label}</h2>
            )}
          </div>

          {/* Goal Picker Dropdown */}
          {isWork && showGoalPicker && (
            <div className="absolute left-0 right-0 top-full mt-2 z-20 p-2 bg-black/50 backdrop-blur-md rounded-lg border border-white/20 shadow-lg max-h-48 overflow-y-auto">
              <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                Work on a goal
              </p>
              {activeGoals.length === 0 ? (
                <p className="p-2 text-sm text-white/70">No active goals for today</p>
              ) : (
                activeGoals.map((goal) => (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => {
                      setSelectedGoal(goal.id);
                      setShowGoalPicker(false);
                    }}
                    className="flex w-full items-center gap-2 rounded p-2 text-left text-sm text-white transition-colors hover:bg-white/20"
                  >
                    <span className="min-w-0 flex-1 truncate">{goal.text}</span>
                    {selectedGoalId === goal.id && <Check className="h-4 w-4 flex-shrink-0" />}
                  </button>
                ))
              )}
              {selectedGoal && (
                <>
                  <div className="my-1 h-px bg-white/15" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGoal(null);
                      setShowGoalPicker(false);
                    }}
                    className="flex w-full items-center gap-2 rounded p-2 text-left text-sm text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                  >
                    <X className="h-4 w-4 flex-shrink-0" />
                    <span>Clear goal</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Timer Display */}
        <div className="flex flex-col items-center mb-density-md">
          {/* Circular Progress */}
          <div className={`relative ${timerSize.container}`}>
            {/* Background circle */}
            <svg
              className="w-full h-full transform -rotate-90"
              viewBox={timerSize.viewBox}
              role="img"
              aria-label={`Timer progress: ${progress.toFixed(0)}% complete`}
            >
              <circle
                cx={timerSize.center}
                cy={timerSize.center}
                r={timerSize.radius}
                className="stroke-white/20"
                strokeWidth={timerSize.strokeWidth}
                fill="none"
              />
              {/* Progress circle */}
              <circle
                cx={timerSize.center}
                cy={timerSize.center}
                r={timerSize.radius}
                stroke={progressColor}
                strokeWidth={timerSize.strokeWidth}
                fill="none"
                strokeDasharray={`${2 * Math.PI * timerSize.radius}`}
                strokeDashoffset={`${2 * Math.PI * timerSize.radius * (1 - progress / 100)}`}
                strokeLinecap="round"
                className="transition-all duration-300 ease-linear"
              />
            </svg>

            {/* Time display in center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className={`${timerSize.fontSize} font-bold text-white font-mono`}>
                {formatTimeRemaining(timeRemaining)}
              </div>
              <div
                className={`mt-2 ${timerSize.labelSize} font-medium uppercase tracking-wider ${color}`}
              >
                {sessionType === 'work' && 'Work'}
                {sessionType === 'break' && 'Break'}
                {sessionType === 'longBreak' && 'Long Break'}
              </div>
            </div>
          </div>
        </div>

        {/* Long Break Progress - dots + "N until long break", below the ring */}
        {isWork && sessionsUntilLongBreak > 0 && (
          <div className="mb-density-md flex items-center justify-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: longBreakInterval }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-5 rounded-full ${
                    i < consecutiveWorkSessions ? '' : 'bg-white/20'
                  }`}
                  style={
                    i < consecutiveWorkSessions ? { backgroundColor: progressColor } : undefined
                  }
                />
              ))}
            </div>
            <span className="text-xs text-white/60">{sessionsUntilLongBreak} until long break</span>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-density-sm">
          {/* Start/Pause/Resume Button */}
          {status === 'idle' && (
            <button
              type="button"
              onClick={start}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
              title="Start timer"
            >
              <Play className="w-4 h-4" />
              <span className="text-sm font-medium">Start</span>
            </button>
          )}

          {status === 'running' && (
            <button
              type="button"
              onClick={pause}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors shadow-md hover:shadow-lg"
              title="Pause timer"
            >
              <Pause className="w-4 h-4" />
              <span className="text-sm font-medium">Pause</span>
            </button>
          )}

          {status === 'paused' && (
            <button
              type="button"
              onClick={resume}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
              title="Resume timer"
            >
              <Play className="w-4 h-4" />
              <span className="text-sm font-medium">Resume</span>
            </button>
          )}

          {/* Reset Button */}
          {status !== 'idle' && (
            <button
              type="button"
              onClick={reset}
              className="p-2.5 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors shadow-md hover:shadow-lg"
              title="Reset timer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* Skip Button */}
          <button
            type="button"
            onClick={skip}
            className="p-2.5 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors shadow-md hover:shadow-lg"
            title={`Skip to ${isWork ? 'break' : 'work'}`}
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Focus Mode Button */}
          {settings.focusModeEnabled && (
            <button
              type="button"
              onClick={() => useFocusModeStore.getState().enterFocusMode()}
              className="p-2.5 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors shadow-md hover:shadow-lg"
              title="Enter focus mode"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Timer rhythm: tap any value to open the shared mini-settings popover. */}
        <div className="mt-density-md">
          <PomodoroMiniSettings settings={settings} onApply={handleApplyTimerSettings} />
          {activeSource !== 'none' && isSoundsPlaying && isWork && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-white/60">
              <Music className="w-3 h-3" />
              <span>{getActiveSourceName()}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
