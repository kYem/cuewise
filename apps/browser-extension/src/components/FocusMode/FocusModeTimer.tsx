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
      {/* Large timer display */}
      <div
        className={cn(
          'text-8xl md:text-9xl font-bold font-mono tracking-tight drop-shadow-2xl',
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
          'text-2xl md:text-3xl mt-4 uppercase tracking-widest font-medium drop-shadow-lg',
          sessionColor
        )}
      >
        {sessionLabel}
      </div>

      {/* Status indicator */}
      {!isRunning && status !== 'idle' && (
        <div className="mt-4 text-white/60 text-lg">{isPaused ? 'Paused' : 'Ready'}</div>
      )}
    </div>
  );
}
