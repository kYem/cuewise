import { formatTimeRemaining } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { usePomodoroStore } from '../../stores/pomodoro-store';

/**
 * Large, centered timer display for focus mode.
 * Shows the remaining time and session type.
 */
export function FocusModeTimer() {
  const { timeRemaining, sessionType, status } = usePomodoroStore();

  const isWork = sessionType === 'work';
  const isBreak = sessionType === 'break';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';

  // Session type label and color
  const sessionLabel = isWork ? 'Focus Time' : isBreak ? 'Short Break' : 'Long Break';

  const sessionColor = isWork ? 'text-green-400' : isBreak ? 'text-blue-400' : 'text-purple-400';

  return (
    <div className="text-center text-white select-none">
      {/* Timer display */}
      <div
        className={cn(
          'text-6xl md:text-7xl font-bold font-mono tracking-tight drop-shadow-2xl',
          'transition-opacity duration-300',
          isPaused && 'animate-pulse'
        )}
        role="timer"
        aria-live="polite"
        aria-label={`Time remaining: ${formatTimeRemaining(timeRemaining)}`}
      >
        {formatTimeRemaining(timeRemaining)}
      </div>

      {/* Session type indicator */}
      <div
        className={cn(
          'text-xl md:text-2xl mt-3 uppercase tracking-widest font-medium drop-shadow-lg',
          sessionColor
        )}
      >
        {sessionLabel}
      </div>

      {/* Status indicator */}
      {!isRunning && status !== 'idle' && (
        <div className="mt-3 text-white/60 text-base">{isPaused ? 'Paused' : 'Ready'}</div>
      )}
    </div>
  );
}
