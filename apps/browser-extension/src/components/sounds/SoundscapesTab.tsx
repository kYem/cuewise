import type { AmbientSoundType } from '@cuewise/shared';
import { SOUNDSCAPE_TILES } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { CloudRain, Coffee, Radio, TreePine, Volume2, Waves, Wind } from 'lucide-react';
import type React from 'react';
import { useSoundsStore } from '../../stores/sounds-store';

// Map icon names to Lucide components
const iconMap: Record<string, React.FC<{ className?: string }>> = {
  CloudRain,
  Waves,
  TreePine,
  Coffee,
  Radio,
  Wind,
};

export const SoundscapesTab: React.FC = () => {
  const selectedAmbientSound = useSoundsStore((state) => state.selectedAmbientSound);
  const activeSource = useSoundsStore((state) => state.activeSource);
  const ambientVolume = useSoundsStore((state) => state.ambientVolume);
  const playAmbient = useSoundsStore((state) => state.playAmbient);
  const setAmbientVolume = useSoundsStore((state) => state.setAmbientVolume);

  const isAmbientPlaying = activeSource === 'ambient';

  const handleTileClick = (soundId: string) => {
    playAmbient(soundId as AmbientSoundType);
  };

  return (
    <div className="space-y-6">
      {/* Soundscape Grid */}
      <div className="grid grid-cols-3 gap-3">
        {SOUNDSCAPE_TILES.map((tile) => {
          const IconComponent = iconMap[tile.icon];
          const isSelected = isAmbientPlaying && selectedAmbientSound === tile.id;

          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => handleTileClick(tile.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-2 p-4 rounded-xl transition-all',
                'border-2',
                isSelected
                  ? 'border-accent bg-accent/10 text-accent shadow-lg shadow-accent/20'
                  : 'border-border bg-surface hover:border-accent/50 hover:bg-surface-variant text-secondary hover:text-primary'
              )}
            >
              {IconComponent && (
                <IconComponent
                  className={cn('w-8 h-8', isSelected ? 'text-accent' : 'text-current')}
                />
              )}
              <span className="text-sm font-medium">{tile.name}</span>
              {isSelected && <span className="text-xs text-accent animate-pulse">Playing</span>}
            </button>
          );
        })}
      </div>

      {/* Volume Slider - only show when ambient is playing */}
      {isAmbientPlaying && (
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-secondary">
              <Volume2 className="w-4 h-4" />
              <span>Volume</span>
            </div>
            <span className="text-sm text-secondary">{ambientVolume}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={ambientVolume}
            onChange={(e) => setAmbientVolume(Number(e.target.value))}
            className="w-full h-2 bg-surface-variant rounded-full appearance-none cursor-pointer accent-accent"
          />
        </div>
      )}

      {/* Instructions */}
      <p className="text-xs text-tertiary text-center">
        Click a soundscape to play. Click again to stop.
      </p>
    </div>
  );
};
