import { formatTimeRemaining } from '@cuewise/shared';
import { Pause, Play, RotateCcw, SkipForward, Timer } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import { usePomodoroStore } from '../stores/pomodoro-store';

export const PomodoroTimer: React.FC = () => {
  const {
    status,
    sessionType,
    timeRemaining,
    totalTime,
    initialize,
    start,
    pause,
    resume,
    reset,
    skip,
    tick,
  } = usePomodoroStore();

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Timer tick effect
  useEffect(() => {
    if (status !== 'running') return;

    const interval = setInterval(() => {
      tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [status, tick]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const progress = totalTime > 0 ? ((totalTime - timeRemaining) / totalTime) * 100 : 0;

  const isWork = sessionType === 'work';
  const sessionColor = isWork ? 'text-primary-600' : 'text-green-600';
  const sessionBgColor = isWork ? 'bg-primary-100' : 'bg-green-100';
  const sessionBorderColor = isWork ? 'border-primary-600' : 'border-green-600';
  const progressColor = isWork ? '#8B5CF6' : '#10B981';

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-8 border border-gray-200">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className={`p-2 ${sessionBgColor} rounded-lg`}>
            <Timer className={`w-6 h-6 ${sessionColor}`} />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gray-800">Pomodoro Timer</h2>
            <p className="text-sm text-gray-500">
              {isWork ? 'Focus Session' : 'Break Time'}
            </p>
          </div>
        </div>

        {/* Timer Display */}
        <div className="flex flex-col items-center mb-8">
          {/* Circular Progress */}
          <div className="relative w-64 h-64 mb-6">
            {/* Background circle */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="128"
                cy="128"
                r="120"
                stroke="#E5E7EB"
                strokeWidth="8"
                fill="none"
              />
              {/* Progress circle */}
              <circle
                cx="128"
                cy="128"
                r="120"
                stroke={progressColor}
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 120}`}
                strokeDashoffset={`${2 * Math.PI * 120 * (1 - progress / 100)}`}
                strokeLinecap="round"
                className="transition-all duration-300 ease-linear"
              />
            </svg>

            {/* Time display in center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-6xl font-bold text-gray-800 font-mono">
                {formatTimeRemaining(timeRemaining)}
              </div>
              <div
                className={`mt-2 text-sm font-medium uppercase tracking-wider ${sessionColor}`}
              >
                {isWork ? 'Work' : 'Break'}
              </div>
            </div>
          </div>

          {/* Session Type Badge */}
          <div
            className={`px-4 py-2 rounded-full border-2 ${sessionBorderColor} ${sessionBgColor}`}
          >
            <span className={`text-sm font-semibold ${sessionColor}`}>
              {status === 'idle' && 'Ready to start'}
              {status === 'running' && 'In progress'}
              {status === 'paused' && 'Paused'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          {/* Start/Pause/Resume Button */}
          {status === 'idle' && (
            <button
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
              onClick={reset}
              className="p-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors shadow-md hover:shadow-lg"
              title="Reset timer"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          )}

          {/* Skip Button */}
          <button
            onClick={skip}
            className="p-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors shadow-md hover:shadow-lg"
            title={`Skip to ${isWork ? 'break' : 'work'}`}
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Focus for 25 minutes, then take a 5-minute break</p>
        </div>
      </div>
    </div>
  );
};
