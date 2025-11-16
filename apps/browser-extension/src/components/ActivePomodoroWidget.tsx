import { formatTimeRemaining } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Pause, Play, Timer } from 'lucide-react';
import type React from 'react';
import { usePomodoroLeader } from '../hooks/usePomodoroLeader';
import { usePomodoroStorageSync, usePomodoroStore } from '../stores/pomodoro-store';

export const ActivePomodoroWidget: React.FC = () => {
  const { status, sessionType, timeRemaining, pause, resume } = usePomodoroStore();

  // Enable cross-tab synchronization
  usePomodoroStorageSync();

  // Timer leader election - only one tab/component runs the timer
  usePomodoroLeader();

  // Only show when there's an active session
  if (status === 'idle') {
    return null;
  }

  const handleTogglePause = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation to Pomodoro page
    if (status === 'running') {
      pause();
    } else {
      resume();
    }
  };

  const handleNavigateToPomodoro = () => {
    window.location.hash = 'pomodoro';
  };

  const sessionLabel =
    sessionType === 'work' ? 'Work' : sessionType === 'break' ? 'Break' : 'Long Break';

  const sessionColor =
    sessionType === 'work'
      ? 'text-primary-600'
      : sessionType === 'break'
        ? 'text-green-600'
        : 'text-blue-600';

  return (
    <div
      onClick={handleNavigateToPomodoro}
      className={cn(
        'group relative flex items-center gap-2 px-3 py-1.5 rounded-full shadow-md hover:shadow-lg transition-all cursor-pointer',
        'bg-surface/80 backdrop-blur-sm border',
        sessionType === 'work' && 'border-primary-600',
        sessionType === 'break' && 'border-green-600',
        sessionType === 'longBreak' && 'border-blue-600'
      )}
      title={`${sessionLabel} session in progress - Click to view`}
    >
      {/* Session Icon */}
      <Timer className={cn('w-4 h-4', sessionColor)} />

      {/* Time Display */}
      <span className="text-base font-bold text-primary tabular-nums">
        {formatTimeRemaining(timeRemaining)}
      </span>

      {/* Pause/Resume Button */}
      <button
        type="button"
        onClick={handleTogglePause}
        className={cn(
          'p-1 rounded-full transition-all hover:scale-110',
          status === 'running'
            ? 'bg-yellow-500 text-white hover:bg-yellow-600'
            : 'bg-green-500 text-white hover:bg-green-600'
        )}
        title={status === 'running' ? 'Pause timer' : 'Resume timer'}
      >
        {status === 'running' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </button>

      {/* Pulsing indicator for running timer */}
      {status === 'running' && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-600"></span>
        </span>
      )}
    </div>
  );
};
