/**
 * Sounds Mini Player
 *
 * A unified floating player widget that shows the current sound source
 * (ambient or YouTube), with play/pause and volume controls.
 * Clicking opens the SoundsPanel popover.
 */

import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import {
  CloudRain,
  Coffee,
  Music,
  Pause,
  Play,
  Radio,
  TreePine,
  Volume2,
  Waves,
  Wind,
} from 'lucide-react';
import type React from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { useSoundsStore } from '../../stores/sounds-store';
import { SoundsPanel } from './SoundsPanel';

// Map ambient sound types to icons
const ambientIcons: Record<string, React.FC<{ className?: string }>> = {
  rain: CloudRain,
  ocean: Waves,
  forest: TreePine,
  cafe: Coffee,
  whiteNoise: Radio,
  brownNoise: Wind,
};

export const SoundsMiniPlayer: React.FC = () => {
  const { settings } = useSettingsStore();

  const activeSource = useSoundsStore((state) => state.activeSource);
  const isPlaying = useSoundsStore((state) => state.isPlaying);
  const selectedAmbientSound = useSoundsStore((state) => state.selectedAmbientSound);
  const ambientVolume = useSoundsStore((state) => state.ambientVolume);
  const youtubeVolume = useSoundsStore((state) => state.youtubeVolume);
  const isPanelOpen = useSoundsStore((state) => state.isPanelOpen);
  const togglePlayPause = useSoundsStore((state) => state.togglePlayPause);
  const setAmbientVolume = useSoundsStore((state) => state.setAmbientVolume);
  const setYoutubeVolume = useSoundsStore((state) => state.setYoutubeVolume);
  const openPanel = useSoundsStore((state) => state.openPanel);
  const closePanel = useSoundsStore((state) => state.closePanel);
  const getSelectedPlaylist = useSoundsStore((state) => state.getSelectedPlaylist);
  const getActiveSourceName = useSoundsStore((state) => state.getActiveSourceName);

  // Only show when music feature is enabled
  if (!settings.pomodoroMusicEnabled) {
    return null;
  }

  const selectedPlaylist = getSelectedPlaylist();
  const sourceName = getActiveSourceName();
  const volume = activeSource === 'ambient' ? ambientVolume : youtubeVolume;
  const setVolume = activeSource === 'ambient' ? setAmbientVolume : setYoutubeVolume;

  // Get icon for current source
  const getSourceIcon = () => {
    if (activeSource === 'ambient' && selectedAmbientSound !== 'none') {
      const IconComponent = ambientIcons[selectedAmbientSound];
      return IconComponent ? <IconComponent className="w-4 h-4 text-white/80" /> : null;
    }
    return <Music className="w-4 h-4 text-white/80" />;
  };

  // Get thumbnail for current source
  const getThumbnail = () => {
    if (activeSource === 'youtube' && selectedPlaylist?.thumbnailUrl) {
      return (
        <img
          src={selectedPlaylist.thumbnailUrl}
          alt={selectedPlaylist.name}
          className="w-full h-full object-cover"
        />
      );
    }

    // Ambient sounds - show icon with gradient background
    if (activeSource === 'ambient' && selectedAmbientSound !== 'none') {
      return (
        <div className="w-full h-full bg-gradient-to-br from-accent/80 to-accent flex items-center justify-center">
          {getSourceIcon()}
        </div>
      );
    }

    // Default - music icon
    return (
      <div className="w-full h-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
        <Music className="w-4 h-4 text-white/80" />
      </div>
    );
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      openPanel();
    } else {
      closePanel();
    }
  };

  const hasActiveSource = activeSource !== 'none';
  // Show controls whenever a source is selected (playing, paused, or stopped)
  const showControls = hasActiveSource;

  return (
    <div className="group relative flex flex-col items-start gap-1">
      {/* Main Controls Row */}
      <div className="flex items-center gap-2">
        {/* Thumbnail/Icon - Click to open popover */}
        <Popover open={isPanelOpen} onOpenChange={handleOpenChange} modal>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'w-8 h-8 rounded-lg overflow-hidden transition-all flex-shrink-0 shadow-md',
                'hover:ring-2 hover:ring-primary-500 hover:scale-105',
                isPlaying && 'ring-2 ring-accent'
              )}
              title="Open sounds panel"
            >
              {getThumbnail()}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={8} className="p-0">
            <SoundsPanel />
          </PopoverContent>
        </Popover>

        {/* Play/Pause Button - only show if we have an active source */}
        {showControls && (
          <button
            type="button"
            onClick={togglePlayPause}
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-105 shadow-md',
              isPlaying
                ? 'bg-accent text-white hover:bg-accent/90'
                : 'bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/50'
            )}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Volume Control - show on hover or when playing */}
        {showControls && (
          <div
            className={cn(
              'flex items-center gap-2 overflow-hidden transition-all duration-200',
              isPanelOpen
                ? 'max-w-[120px] opacity-100'
                : 'max-w-0 opacity-0 group-hover:max-w-[120px] group-hover:opacity-100'
            )}
          >
            <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm px-2 py-1 rounded">
              <Volume2 className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="w-12 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-accent"
                title={`Volume: ${volume}%`}
              />
            </div>
          </div>
        )}

        {/* Playing indicator */}
        {isPlaying && (
          <span className="absolute top-0 left-0 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
          </span>
        )}
      </div>

      {/* Source Name - show on hover or when panel is open */}
      {hasActiveSource && (
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            isPanelOpen
              ? 'max-h-8 opacity-100'
              : 'max-h-0 opacity-0 group-hover:max-h-8 group-hover:opacity-100'
          )}
        >
          <span className="text-xs text-white/90 font-medium truncate max-w-[180px] bg-black/40 backdrop-blur-sm px-2 py-1 rounded inline-block">
            {sourceName.length > 25 ? `${sourceName.substring(0, 25)}...` : sourceName}
          </span>
        </div>
      )}
    </div>
  );
};
