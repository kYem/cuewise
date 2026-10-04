import { cn } from '@cuewise/ui';
import { Music, Pause, Play } from 'lucide-react';
import type React from 'react';
import { useSoundsStore } from '../../stores/sounds-store';

interface NowPlayingPillProps {
  className?: string;
}

/** Off the Pomodoro page, the one place a sound that outlived it can be paused. */
export const NowPlayingPill: React.FC<NowPlayingPillProps> = ({ className }) => {
  const activeSource = useSoundsStore((state) => state.activeSource);
  const isPlaying = useSoundsStore((state) => state.isPlaying);
  const isPaused = useSoundsStore((state) => state.isPaused);
  const togglePlayPause = useSoundsStore((state) => state.togglePlayPause);
  const sourceName = useSoundsStore((state) => state.getActiveSourceName());

  // Paused counts so the pill doesn't vanish under the cursor that just paused it; stop hides it.
  if (activeSource === 'none' || (!isPlaying && !isPaused)) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full shadow-md',
        'bg-surface/80 backdrop-blur-sm text-primary',
        className
      )}
      data-testid="now-playing-pill"
    >
      <Music className="w-4 h-4 text-primary-600 flex-shrink-0" />
      <span className="hidden sm:inline max-w-[140px] truncate text-sm font-medium">
        {sourceName}
      </span>
      <button
        type="button"
        onClick={togglePlayPause}
        className={cn(
          'p-1 rounded-full text-white transition-all hover:scale-110',
          isPlaying ? 'bg-orange-500 hover:bg-orange-600' : 'bg-primary-600 hover:bg-primary-700'
        )}
        title={isPlaying ? `Pause ${sourceName}` : `Play ${sourceName}`}
        aria-label={isPlaying ? 'Pause sound' : 'Play sound'}
      >
        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </button>
    </div>
  );
};
