import { formatTimeRemaining } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Pause, Play } from 'lucide-react';
import type React from 'react';
import { usePomodoroLeader } from '../hooks/usePomodoroLeader';
import { usePomodoroStorageSync, usePomodoroStore } from '../stores/pomodoro-store';
import { getSessionLabel } from '../utils/pomodoro-styles';

/**
 * Compact timer rendered inside the Document Picture-in-Picture window. It shares
 * the global pomodoro store with the main app and runs the leader/sync hooks, so
 * the countdown keeps ticking even when the opener tab shows a page without a
 * timer surface.
 */
export const PomodoroPipWidget: React.FC = () => {
  const status = usePomodoroStore((state) => state.status);
  const sessionType = usePomodoroStore((state) => state.sessionType);
  const timeRemaining = usePomodoroStore((state) => state.timeRemaining);
  const pause = usePomodoroStore((state) => state.pause);
  const resume = usePomodoroStore((state) => state.resume);

  usePomodoroStorageSync();
  usePomodoroLeader();

  const running = status === 'running';

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-surface px-4 text-primary">
      <span className="text-[11px] font-bold uppercase tracking-widest text-secondary">
        {getSessionLabel(sessionType)}
      </span>
      <span className="font-mono text-5xl font-bold tabular-nums">
        {formatTimeRemaining(timeRemaining)}
      </span>
      {status === 'idle' ? (
        <span className="text-xs text-tertiary">No active session</span>
      ) : (
        <button
          type="button"
          onClick={running ? pause : resume}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-white transition-colors',
            running ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-primary-600 hover:bg-primary-700'
          )}
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? 'Pause' : 'Resume'}
        </button>
      )}
    </div>
  );
};
