import { formatTimeRemaining } from '@cuewise/shared';
import { Pause, Play, RotateCcw, SkipForward, Target } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';
import { usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { ambientSoundPlayer } from '../utils/ambient-sounds';
import { getSessionStyles } from '../utils/pomodoro-styles';
import { EditableValue } from './EditableValue';

export const PomodoroTimer: React.FC = () => {
  const {
    status,
    sessionType,
    timeRemaining,
    totalTime,
    workDuration,
    breakDuration,
    longBreakDuration,
    consecutiveWorkSessions,
    longBreakInterval,
    selectedGoalId,
    ambientSound,
    ambientVolume,
    initialize,
    start,
    pause,
    resume,
    reset,
    skip,
    tick,
    setSelectedGoal,
    reloadSettings,
  } = usePomodoroStore();

  const { todayGoals, initialize: initGoals } = useGoalStore();
  const { updateSettings, settings } = useSettingsStore();

  const [showGoalPicker, setShowGoalPicker] = useState(false);

  // Initialize on mount
  useEffect(() => {
    initialize();
    initGoals();
  }, [initialize, initGoals]);

  // Timer tick effect
  useEffect(() => {
    if (status !== 'running') return;

    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [status, tick]);

  // Ambient sound management
  useEffect(() => {
    if (status === 'running' && sessionType === 'work' && ambientSound !== 'none') {
      // Start ambient sound during work sessions
      ambientSoundPlayer.play(
        ambientSound as 'rain' | 'ocean' | 'forest' | 'cafe' | 'whiteNoise' | 'brownNoise',
        ambientVolume
      );
    } else {
      // Stop ambient sound when not in work session or when paused
      if (ambientSoundPlayer.getIsPlaying()) {
        ambientSoundPlayer.stop();
      }
    }

    // Cleanup on unmount
    return () => {
      if (ambientSoundPlayer.getIsPlaying()) {
        ambientSoundPlayer.stop();
      }
    };
  }, [status, sessionType, ambientSound, ambientVolume]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const progress = totalTime > 0 ? ((totalTime - timeRemaining) / totalTime) * 100 : 0;

  const isWork = sessionType === 'work';

  // Get session-specific styles
  const {
    color,
    bgColor,
    borderColor,
    progressColor,
    label,
    icon: SessionIcon,
  } = getSessionStyles(sessionType);

  // Find selected goal
  const selectedGoal = todayGoals.find((g) => g.id === selectedGoalId);

  // Calculate sessions until long break
  const sessionsUntilLongBreak = longBreakInterval - consecutiveWorkSessions;

  // Get density-aware sizing
  const density = settings.layoutDensity;
  const timerSizes = {
    compact: {
      container: 'w-48 h-48',
      radius: 90,
      center: 96,
      strokeWidth: 6,
      fontSize: 'text-4xl',
      labelSize: 'text-xs',
      viewBox: '0 0 192 192',
    },
    comfortable: {
      container: 'w-64 h-64',
      radius: 120,
      center: 128,
      strokeWidth: 8,
      fontSize: 'text-6xl',
      labelSize: 'text-sm',
      viewBox: '0 0 256 256',
    },
    spacious: {
      container: 'w-80 h-80',
      radius: 150,
      center: 160,
      strokeWidth: 10,
      fontSize: 'text-7xl',
      labelSize: 'text-base',
      viewBox: '0 0 320 320',
    },
  };
  const timerSize = timerSizes[density];

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-surface/80 backdrop-blur-sm rounded-2xl shadow-lg p-density-lg border border-border">
        {/* Header */}
        <div className="flex items-center gap-density-sm mb-density-md">
          <div className={`p-2 ${bgColor} rounded-lg`}>
            <SessionIcon className={`w-6 h-6 ${color}`} />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-primary">
              Pomodoro Timer
            </h2>
            <p className="text-sm text-secondary">{label}</p>
          </div>
        </div>

        {/* Goal Selection (only show for work sessions when idle) */}
        {isWork && status === 'idle' && (
          <div className="mb-density-md">
            {selectedGoal ? (
              <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                <Target className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                <span className="text-sm text-primary flex-1">
                  {selectedGoal.text}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedGoal(null)}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                  title="Clear goal"
                >
                  Clear
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowGoalPicker(!showGoalPicker)}
                className="w-full flex items-center gap-2 p-3 bg-surface-variant rounded-lg border border-border hover:bg-border transition-colors"
                title="Select a goal"
              >
                <Target className="w-4 h-4 text-secondary" />
                <span className="text-sm text-secondary">Work on a goal (optional)</span>
              </button>
            )}

            {/* Goal Picker Dropdown */}
            {showGoalPicker && !selectedGoal && (
              <div className="mt-2 p-2 bg-surface-elevated rounded-lg border border-border shadow-lg max-h-48 overflow-y-auto">
                {todayGoals.filter((g) => !g.completed).length === 0 ? (
                  <p className="text-sm text-secondary p-2">No active goals for today</p>
                ) : (
                  todayGoals
                    .filter((g) => !g.completed)
                    .map((goal) => (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => {
                          setSelectedGoal(goal.id);
                          setShowGoalPicker(false);
                        }}
                        className="w-full text-left p-2 text-sm text-primary hover:bg-surface-variant rounded transition-colors"
                      >
                        {goal.text}
                      </button>
                    ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Active Goal Display (during session) */}
        {isWork && status !== 'idle' && selectedGoal && (
          <div className="mb-density-md flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
            <Target className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
            <span className="text-sm text-primary">{selectedGoal.text}</span>
          </div>
        )}

        {/* Long Break Progress */}
        {isWork && sessionsUntilLongBreak > 0 && (
          <div className="mb-density-md text-center">
            <p className="text-xs text-secondary">
              {sessionsUntilLongBreak} session{sessionsUntilLongBreak !== 1 ? 's' : ''} until long
              break
            </p>
            <div className="mt-2 flex gap-1 justify-center">
              {Array.from({ length: longBreakInterval }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-8 rounded-full ${
                    i < consecutiveWorkSessions ? 'bg-purple-500' : 'bg-divider'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Timer Display */}
        <div className="flex flex-col items-center mb-density-lg">
          {/* Circular Progress */}
          <div className={`relative ${timerSize.container} mb-density-md`}>
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
                stroke="#E5E7EB"
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
              <div className={`${timerSize.fontSize} font-bold text-primary font-mono`}>
                {formatTimeRemaining(timeRemaining)}
              </div>
              <div className={`mt-2 ${timerSize.labelSize} font-medium uppercase tracking-wider ${color}`}>
                {sessionType === 'work' && 'Work'}
                {sessionType === 'break' && 'Break'}
                {sessionType === 'longBreak' && 'Long Break'}
              </div>
            </div>
          </div>

          {/* Session Type Badge */}
          <div className={`px-4 py-2 rounded-full border-2 ${borderColor} ${bgColor}`}>
            <span className={`text-sm font-semibold ${color}`}>
              {status === 'idle' && 'Ready to start'}
              {status === 'running' && 'In progress'}
              {status === 'paused' && 'Paused'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-density-sm">
          {/* Start/Pause/Resume Button */}
          {status === 'idle' && (
            <button
              type="button"
              onClick={start}
              className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
              title="Start timer"
            >
              <Play className="w-5 h-5" />
              <span className="font-medium">Start</span>
            </button>
          )}

          {status === 'running' && (
            <button
              type="button"
              onClick={pause}
              className="flex items-center gap-2 px-6 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors shadow-md hover:shadow-lg"
              title="Pause timer"
            >
              <Pause className="w-5 h-5" />
              <span className="font-medium">Pause</span>
            </button>
          )}

          {status === 'paused' && (
            <button
              type="button"
              onClick={resume}
              className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-md hover:shadow-lg"
              title="Resume timer"
            >
              <Play className="w-5 h-5" />
              <span className="font-medium">Resume</span>
            </button>
          )}

          {/* Reset Button */}
          {status !== 'idle' && (
            <button
              type="button"
              onClick={reset}
              className="p-3 bg-surface-variant text-primary rounded-lg hover:bg-border transition-colors shadow-md hover:shadow-lg"
              title="Reset timer"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          )}

          {/* Skip Button */}
          <button
            type="button"
            onClick={skip}
            className="p-3 bg-surface-variant text-primary rounded-lg hover:bg-border transition-colors shadow-md hover:shadow-lg"
            title={`Skip to ${isWork ? 'break' : 'work'}`}
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Help Text - Interactive Settings */}
        <div className="mt-density-md text-center text-xs text-secondary">
          <p className="leading-relaxed">
            Focus for{' '}
            <EditableValue
              value={workDuration}
              unit="minutes"
              presets={[15, 20, 25, 30, 45, 60]}
              onChange={async (value) => {
                await updateSettings({ ...settings, pomodoroWorkDuration: value });
                await reloadSettings();
              }}
            />{' '}
            •{' '}
            <EditableValue
              value={breakDuration}
              unit="minute"
              presets={[3, 5, 10, 15]}
              onChange={async (value) => {
                await updateSettings({ ...settings, pomodoroBreakDuration: value });
                await reloadSettings();
              }}
            />{' '}
            breaks •{' '}
            <EditableValue
              value={longBreakDuration}
              unit="minute"
              presets={[15, 20, 25, 30]}
              onChange={async (value) => {
                await updateSettings({ ...settings, pomodoroLongBreakDuration: value });
                await reloadSettings();
              }}
            />{' '}
            long break every{' '}
            <EditableValue
              value={longBreakInterval}
              unit={longBreakInterval === 1 ? 'session' : 'sessions'}
              presets={[2, 3, 4, 5, 6, 8]}
              onChange={async (value) => {
                await updateSettings({ ...settings, pomodoroLongBreakInterval: value });
                await reloadSettings();
              }}
            />
          </p>
          {ambientSound !== 'none' && isWork && (
            <p className="mt-1 text-purple-600">🎵 Ambient sound: {ambientSound}</p>
          )}
        </div>
      </div>
    </div>
  );
};
