import { cn } from '@cuewise/ui';
import { Check, Music, Plus, Trash2, Volume2 } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useSoundsStore } from '../../stores/sounds-store';

export const YouTubeTab: React.FC = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlaylistUrl, setNewPlaylistUrl] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const playlists = useSoundsStore((state) => state.playlists);
  const selectedPlaylistId = useSoundsStore((state) => state.selectedPlaylistId);
  const activeSource = useSoundsStore((state) => state.activeSource);
  const isPlaying = useSoundsStore((state) => state.isPlaying);
  const youtubeVolume = useSoundsStore((state) => state.youtubeVolume);
  const playYoutube = useSoundsStore((state) => state.playYoutube);
  const setYoutubeVolume = useSoundsStore((state) => state.setYoutubeVolume);
  const addCustomPlaylist = useSoundsStore((state) => state.addCustomPlaylist);
  const removeCustomPlaylist = useSoundsStore((state) => state.removeCustomPlaylist);

  const isYoutubePlaying = activeSource === 'youtube' && isPlaying;

  const handleSelectPlaylist = async (playlistId: string) => {
    await playYoutube(playlistId);
  };

  const handleAddPlaylist = async () => {
    if (!newPlaylistUrl.trim()) {
      return;
    }
    await addCustomPlaylist(newPlaylistUrl.trim(), newPlaylistName.trim() || undefined);
    setNewPlaylistUrl('');
    setNewPlaylistName('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Add playlist form */}
      <div className="space-y-2">
        {showAddForm ? (
          <div className="space-y-2 p-3 bg-surface-variant/50 rounded-lg">
            <input
              type="text"
              placeholder="YouTube playlist URL"
              value={newPlaylistUrl}
              onChange={(e) => setNewPlaylistUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-primary placeholder-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="text"
              placeholder="Name (optional)"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddPlaylist();
                }
              }}
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-primary placeholder-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddPlaylist}
                disabled={!newPlaylistUrl.trim()}
                className="flex-1 px-3 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                Add Playlist
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-2 text-sm bg-surface-variant text-secondary rounded-lg hover:bg-surface-variant/80 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-secondary border-2 border-dashed border-border rounded-lg hover:border-accent hover:text-primary transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Custom Playlist
          </button>
        )}
      </div>

      {/* Playlist Grid */}
      <div className="grid grid-cols-2 gap-3">
        {playlists.map((playlist) => {
          const isSelected = selectedPlaylistId === playlist.id;
          const isCurrentlyPlaying = isYoutubePlaying && isSelected;

          return (
            <div
              key={playlist.id}
              className={cn(
                'relative group rounded-xl overflow-hidden border-2 transition-all',
                isCurrentlyPlaying
                  ? 'border-accent shadow-lg shadow-accent/20'
                  : isSelected
                    ? 'border-accent/50'
                    : 'border-transparent hover:border-accent/30'
              )}
            >
              {/* Thumbnail with click handler */}
              <button
                type="button"
                onClick={() => handleSelectPlaylist(playlist.id)}
                className="w-full aspect-video relative"
              >
                {playlist.thumbnailUrl ? (
                  <img
                    src={playlist.thumbnailUrl}
                    alt={playlist.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-surface-variant flex items-center justify-center">
                    <Music className="w-8 h-8 text-secondary" />
                  </div>
                )}

                {/* Overlay on hover/selected */}
                <div
                  className={cn(
                    'absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity',
                    isCurrentlyPlaying || isSelected
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100'
                  )}
                >
                  {isCurrentlyPlaying && (
                    <div className="flex items-center gap-1">
                      <span className="w-1 h-4 bg-white rounded-full animate-pulse" />
                      <span className="w-1 h-6 bg-white rounded-full animate-pulse delay-75" />
                      <span className="w-1 h-4 bg-white rounded-full animate-pulse delay-150" />
                    </div>
                  )}
                  {isSelected && !isCurrentlyPlaying && <Check className="w-6 h-6 text-white" />}
                </div>

                {/* Playing indicator */}
                {isCurrentlyPlaying && (
                  <span className="absolute top-2 left-2 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
                  </span>
                )}
              </button>

              {/* Name and remove button */}
              <div className="flex items-center gap-2 p-2 bg-surface">
                <span className="flex-1 text-xs font-medium text-primary truncate">
                  {playlist.name}
                </span>
                {playlist.isCustom && (
                  <button
                    type="button"
                    onClick={() => removeCustomPlaylist(playlist.id)}
                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove playlist"
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Volume slider - show when YouTube is playing */}
      {isYoutubePlaying && (
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-secondary">
              <Volume2 className="w-4 h-4" />
              <span>Volume</span>
            </div>
            <span className="text-sm text-secondary">{youtubeVolume}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={youtubeVolume}
            onChange={(e) => setYoutubeVolume(Number(e.target.value))}
            className="w-full h-2 bg-surface-variant rounded-full appearance-none cursor-pointer accent-accent"
          />
        </div>
      )}
    </div>
  );
};
