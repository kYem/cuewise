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
import type { ChromeVariant } from '../../utils/chrome-variant';
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

// 'overlay' is white-on-dark for the Glass photo; 'surface' uses theme tokens and is only
// ever used off Glass, where bg-primary-600 is a real colour rather than translucent black.
const CHROME = {
  overlay: {
    pill: 'bg-black/40 backdrop-blur-sm',
    // The thumbnail fills a rounded, clipped button, so it must stay borderless.
    thumb: 'bg-black/40 backdrop-blur-sm',
    icon: 'text-white/80',
    label: 'text-white/90',
    muted: 'text-white/70',
    button: 'bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/50',
    buttonActive: 'bg-white/25 backdrop-blur-sm text-white hover:bg-white/35',
    ring: 'ring-white/80',
    ringHover: 'hover:ring-white/90',
    dot: 'bg-white',
  },
  surface: {
    pill: 'bg-surface/80 backdrop-blur-sm border border-border',
    thumb: 'bg-surface/80 backdrop-blur-sm',
    icon: 'text-secondary',
    label: 'text-primary',
    muted: 'text-secondary',
    button: 'bg-surface-variant text-primary hover:bg-surface-variant/70',
    buttonActive: 'bg-primary-600 text-white hover:bg-primary-700',
    ring: 'ring-primary-600',
    ringHover: 'hover:ring-primary-700',
    dot: 'bg-primary-600',
  },
} as const;

interface SoundsMiniPlayerProps {
  variant?: ChromeVariant;
}

export const SoundsMiniPlayer: React.FC<SoundsMiniPlayerProps> = ({ variant = 'overlay' }) => {
  const c = CHROME[variant];
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
      return IconComponent ? <IconComponent className={`w-4 h-4 ${c.icon}`} /> : null;
    }
    return <Music className={`w-4 h-4 ${c.icon}`} />;
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

    return (
      <div className={`w-full h-full ${c.thumb} flex items-center justify-center`}>
        {getSourceIcon()}
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
                'hover:ring-2 hover:scale-105',
                c.ringHover,
                isPlaying && `ring-2 ${c.ring}`
              )}
              title="Open sounds panel"
            >
              {getThumbnail()}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="p-0 bg-surface/95 backdrop-blur-xl"
          >
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
              isPlaying ? c.buttonActive : c.button
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
            <div className={`flex items-center gap-1 ${c.pill} px-2 py-1 rounded`}>
              <Volume2 className={`w-3.5 h-3.5 ${c.muted} flex-shrink-0`} />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="w-12 h-1 rounded-lg appearance-none cursor-pointer accent-primary-600"
                title={`Volume: ${volume}%`}
              />
            </div>
          </div>
        )}

        {isPlaying && (
          <span className="absolute top-0 left-0 flex h-2.5 w-2.5" data-testid="playing-indicator">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.dot} opacity-75`}
            />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${c.dot}`} />
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
          <span
            className={`text-xs ${c.label} font-medium truncate max-w-[180px] ${c.pill} px-2 py-1 rounded inline-block`}
          >
            {sourceName.length > 25 ? `${sourceName.substring(0, 25)}...` : sourceName}
          </span>
        </div>
      )}
    </div>
  );
};
