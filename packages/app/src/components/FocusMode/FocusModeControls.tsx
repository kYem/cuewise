import { cn } from '@cuewise/ui';
import { ImageIcon, Minimize2, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useFocusModeStore } from '../../stores/focus-mode-store';
import { usePomodoroStore } from '../../stores/pomodoro-store';

interface FocusModeControlsProps {
  onExit: () => void;
}

/**
 * Minimal controls for focus mode.
 * Includes play/pause, skip, reset, new image, and exit buttons.
 */
export function FocusModeControls({ onExit }: FocusModeControlsProps) {
  const { status, start, pause, resume, reset, skip } = usePomodoroStore();
  const { loadNextImage, isImageLoading } = useFocusModeStore();

  const isIdle = status === 'idle';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';

  const handlePlayPause = () => {
    if (isIdle) {
      start();
    } else if (isRunning) {
      pause();
    } else if (isPaused) {
      resume();
    }
  };

  const handleReset = () => {
    reset();
  };

  const handleSkip = () => {
    skip();
  };

  const handleNewImage = () => {
    if (!isImageLoading) {
      loadNextImage();
    }
  };

  const buttonClass = cn(
    'p-4 rounded-full transition-all duration-200',
    'bg-white/10 hover:bg-white/20 active:bg-white/30',
    'backdrop-blur-sm border border-white/20',
    'text-white shadow-lg',
    'focus:outline-none focus:ring-2 focus:ring-white/50'
  );

  const primaryButtonClass = cn(
    'p-5 rounded-full transition-all duration-200',
    'bg-white/20 hover:bg-white/30 active:bg-white/40',
    'backdrop-blur-sm border border-white/30',
    'text-white shadow-xl',
    'focus:outline-none focus:ring-2 focus:ring-white/50'
  );

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
      <div className="flex items-center gap-4">
        {/* Reset button */}
        <button
          type="button"
          onClick={handleReset}
          className={buttonClass}
          title="Reset timer"
          aria-label="Reset timer"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        {/* Play/Pause button (primary) */}
        <button
          type="button"
          onClick={handlePlayPause}
          className={primaryButtonClass}
          title={isRunning ? 'Pause' : 'Start'}
          aria-label={isRunning ? 'Pause timer' : 'Start timer'}
        >
          {isRunning ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
        </button>

        {/* Skip button */}
        <button
          type="button"
          onClick={handleSkip}
          className={buttonClass}
          title="Skip to next session"
          aria-label="Skip to next session"
          disabled={isIdle}
        >
          <SkipForward className="w-5 h-5" />
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-white/20 mx-2" />

        {/* New image button */}
        <button
          type="button"
          onClick={handleNewImage}
          className={cn(buttonClass, isImageLoading && 'opacity-50')}
          title="Load new background"
          aria-label="Load new background image"
          disabled={isImageLoading}
        >
          <ImageIcon className={cn('w-5 h-5', isImageLoading && 'animate-pulse')} />
        </button>

        {/* Exit button */}
        <button
          type="button"
          onClick={onExit}
          className={buttonClass}
          title="Exit focus mode (Esc)"
          aria-label="Exit focus mode"
        >
          <Minimize2 className="w-5 h-5" />
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-center text-white/40 text-sm mt-4">
        Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/60">Esc</kbd> to exit
      </p>
    </div>
  );
}
