/**
 * Music Mini Player
 *
 * A compact floating player widget showing current playlist, play/pause button,
 * volume control and settings (visible on hover).
 */

import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Music,
  Pause,
  Play,
  Plus,
  Settings,
  Trash2,
  Volume2,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMusicStore } from '../stores/music-store';
import { useSettingsStore } from '../stores/settings-store';

export const MusicMiniPlayer: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlaylistUrl, setNewPlaylistUrl] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const nowPlayingRef = useRef<HTMLDivElement>(null);
  const {
    isPlaying,
    volume,
    selectedPlaylistId,
    playlists,
    isNowPlayingOpen,
    togglePlayPause,
    setVolume,
    selectPlaylist,
    addCustomPlaylist,
    removeCustomPlaylist,
    play,
    openNowPlaying,
    closeNowPlaying,
  } = useMusicStore();

  // Move YouTube iframe into Now Playing container when opened
  useEffect(() => {
    const youtubeContainer = document.getElementById('youtube-player-container');
    const youtubeIframe = document.getElementById('youtube-player-iframe');

    if (isNowPlayingOpen && nowPlayingRef.current && youtubeContainer) {
      nowPlayingRef.current.appendChild(youtubeContainer);
      // Make container visible and fill the Now Playing area
      youtubeContainer.style.cssText = `
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 180px;
        border: none;
        background: black;
        overflow: visible;
        pointer-events: auto;
      `;
      // Ensure iframe fills the container
      if (youtubeIframe) {
        youtubeIframe.style.cssText = `
          width: 100%;
          height: 100%;
          min-height: 180px;
          border: none;
          display: block;
        `;
      }
    } else if (!isNowPlayingOpen && youtubeContainer) {
      // Move back to body when closed (hidden)
      document.body.appendChild(youtubeContainer);
      youtubeContainer.style.cssText = `
        position: fixed;
        bottom: -9999px;
        left: -9999px;
        width: 1px;
        height: 1px;
        overflow: hidden;
        pointer-events: none;
      `;
      // Reset iframe to fill container (for background playback)
      if (youtubeIframe) {
        youtubeIframe.style.cssText = `
          width: 100%;
          height: 100%;
          border: none;
          display: block;
        `;
      }
    }
  }, [isNowPlayingOpen]);

  // Only show when music feature is enabled
  if (!settings.pomodoroMusicEnabled) {
    return null;
  }

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);
  const playlistName = selectedPlaylist?.name || 'Select Music';

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  const handleAutoStartToggle = async () => {
    await updateSettings({
      ...settings,
      pomodoroMusicAutoStart: !settings.pomodoroMusicAutoStart,
    });
  };

  const handlePlayDuringBreaksToggle = async () => {
    await updateSettings({
      ...settings,
      pomodoroMusicPlayDuringBreaks: !settings.pomodoroMusicPlayDuringBreaks,
    });
  };

  const handleSelectPlaylist = (playlistId: string) => {
    selectPlaylist(playlistId);
    play();
    setIsPlaylistOpen(false);
  };

  const handleAddPlaylist = () => {
    if (!newPlaylistUrl.trim()) {
      return;
    }
    addCustomPlaylist(newPlaylistUrl.trim(), newPlaylistName.trim() || undefined);
    setNewPlaylistUrl('');
    setNewPlaylistName('');
    setShowAddForm(false);
  };

  // Truncate name for hover display
  const truncatedName =
    playlistName.length > 30 ? `${playlistName.substring(0, 30)}...` : playlistName;

  return (
    <div className="group relative flex flex-col items-start gap-1">
      {/* Main Controls Row */}
      <div className="flex items-center gap-2">
        {/* Playlist Thumbnail with Popover */}
        <Popover open={isPlaylistOpen} onOpenChange={setIsPlaylistOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'w-8 h-8 rounded-lg overflow-hidden transition-all flex-shrink-0 shadow-md',
                'hover:ring-2 hover:ring-primary-500 hover:scale-105',
                isPlaying && 'ring-2 ring-primary-500'
              )}
            >
              {selectedPlaylist?.thumbnailUrl ? (
                <img
                  src={selectedPlaylist.thumbnailUrl}
                  alt={playlistName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                  <Music className="w-4 h-4 text-white/80" />
                </div>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-64 p-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-semibold text-primary uppercase tracking-wide">
                  Playlists
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="p-1 rounded hover:bg-surface-variant transition-colors"
                  title="Add custom playlist"
                >
                  <Plus className="w-3.5 h-3.5 text-secondary" />
                </button>
              </div>

              {/* Add custom playlist form */}
              {showAddForm && (
                <div className="space-y-1 p-1">
                  <input
                    type="text"
                    placeholder="YouTube playlist URL"
                    value={newPlaylistUrl}
                    onChange={(e) => setNewPlaylistUrl(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded bg-surface border border-border text-primary placeholder-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                    className="w-full px-2 py-1 text-xs rounded bg-surface border border-border text-primary placeholder-tertiary focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddPlaylist}
                    disabled={!newPlaylistUrl.trim()}
                    className="w-full px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                  >
                    Add Playlist
                  </button>
                </div>
              )}

              {/* Playlist list */}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {playlists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className={cn(
                      'w-full flex items-center gap-2 p-1.5 rounded-lg transition-colors text-left',
                      selectedPlaylistId === playlist.id
                        ? 'bg-primary-100 dark:bg-primary-900/30'
                        : 'hover:bg-surface-variant'
                    )}
                  >
                    {/* Clickable area for playlist selection */}
                    <button
                      type="button"
                      onClick={() => handleSelectPlaylist(playlist.id)}
                      className="flex items-center gap-2 flex-1 min-w-0"
                    >
                      {/* Thumbnail */}
                      <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-surface-variant">
                        {playlist.thumbnailUrl ? (
                          <img
                            src={playlist.thumbnailUrl}
                            alt={playlist.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-4 h-4 text-secondary" />
                          </div>
                        )}
                      </div>

                      {/* Name */}
                      <span className="flex-1 text-sm text-primary truncate">{playlist.name}</span>

                      {/* Selected indicator */}
                      {selectedPlaylistId === playlist.id && (
                        <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />
                      )}
                    </button>

                    {/* Remove button for custom - outside the playlist select button */}
                    {playlist.isCustom && (
                      <button
                        type="button"
                        onClick={() => removeCustomPlaylist(playlist.id)}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"
                        title="Remove"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Now Playing button */}
              {selectedPlaylist && (
                <button
                  type="button"
                  onClick={() => {
                    openNowPlaying();
                    setIsPlaylistOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2 py-2 mt-2 text-sm font-medium text-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                >
                  <span>Now Playing</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlayPause}
          className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-105 shadow-md',
            isPlaying
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : 'bg-black/40 backdrop-blur-sm text-white/80 hover:bg-black/50'
          )}
          title={isPlaying ? 'Pause music' : 'Play music'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        {/* Volume + Settings Controls - show on hover or when popovers open */}
        <div
          className={cn(
            'flex items-center gap-2 overflow-hidden transition-all duration-200',
            isSettingsOpen || isPlaylistOpen || isNowPlayingOpen
              ? 'max-w-[150px] opacity-100'
              : 'max-w-0 opacity-0 group-hover:max-w-[150px] group-hover:opacity-100'
          )}
        >
          {/* Volume Control */}
          <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm px-2 py-1 rounded">
            <Volume2 className="w-3.5 h-3.5 text-white/70 flex-shrink-0" />
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="w-12 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary-500"
              title={`Volume: ${volume}%`}
            />
          </div>

          {/* Settings Popover */}
          <Popover open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-1.5 rounded-lg bg-black/40 backdrop-blur-sm hover:bg-black/50 transition-colors"
                title="Music settings"
              >
                <Settings className="w-3.5 h-3.5 text-white/70" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" className="w-56 p-2">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-primary uppercase tracking-wide px-2 py-1">
                  Music Settings
                </h4>

                {/* Auto-start with Pomodoro */}
                <label className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-variant cursor-pointer">
                  <span className="text-sm text-primary">Auto-start with timer</span>
                  <button
                    type="button"
                    onClick={handleAutoStartToggle}
                    className={cn(
                      'relative w-9 h-5 rounded-full transition-colors',
                      settings.pomodoroMusicAutoStart ? 'bg-primary-600' : 'bg-surface-variant'
                    )}
                    role="switch"
                    aria-checked={settings.pomodoroMusicAutoStart}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        settings.pomodoroMusicAutoStart && 'translate-x-4'
                      )}
                    />
                  </button>
                </label>

                {/* Play during breaks */}
                <label className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-variant cursor-pointer">
                  <span className="text-sm text-primary">Play during breaks</span>
                  <button
                    type="button"
                    onClick={handlePlayDuringBreaksToggle}
                    className={cn(
                      'relative w-9 h-5 rounded-full transition-colors',
                      settings.pomodoroMusicPlayDuringBreaks
                        ? 'bg-primary-600'
                        : 'bg-surface-variant'
                    )}
                    role="switch"
                    aria-checked={settings.pomodoroMusicPlayDuringBreaks}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        settings.pomodoroMusicPlayDuringBreaks && 'translate-x-4'
                      )}
                    />
                  </button>
                </label>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Playing indicator - subtle dot on thumbnail */}
        {isPlaying && (
          <span className="absolute top-0 left-0 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500" />
          </span>
        )}
      </div>

      {/* Playlist Name - show on hover or when popovers open */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isSettingsOpen || isPlaylistOpen || isNowPlayingOpen
            ? 'max-h-8 opacity-100'
            : 'max-h-0 opacity-0 group-hover:max-h-8 group-hover:opacity-100'
        )}
      >
        <span className="text-xs text-white/90 font-medium truncate max-w-[180px] bg-black/40 backdrop-blur-sm px-2 py-1 rounded inline-block">
          {truncatedName}
        </span>
      </div>

      {/* Now Playing Panel - positioned below the controls */}
      {isNowPlayingOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 w-80 bg-surface rounded-xl shadow-2xl border border-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 p-3 border-b border-border">
            <button
              type="button"
              onClick={closeNowPlaying}
              className="p-1 rounded-lg hover:bg-surface-variant transition-colors"
              title="Back to playlists"
            >
              <ArrowLeft className="w-5 h-5 text-secondary" />
            </button>
            {selectedPlaylist?.thumbnailUrl && (
              <img
                src={selectedPlaylist.thumbnailUrl}
                alt={selectedPlaylist.name}
                className="w-8 h-8 rounded object-cover"
              />
            )}
            <span className="flex-1 text-sm font-medium text-primary truncate">
              {selectedPlaylist?.name || 'Now Playing'}
            </span>
          </div>

          {/* YouTube Player Container */}
          <div ref={nowPlayingRef} className="w-full aspect-video bg-black" />

          {/* Controls */}
          <div className="flex items-center justify-between p-3 border-t border-border">
            <button
              type="button"
              onClick={togglePlayPause}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isPlaying
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-surface-variant text-primary hover:bg-surface-variant/80'
              )}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2 flex-1 mx-4">
              <Volume2 className="w-4 h-4 text-secondary flex-shrink-0" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="flex-1 h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer accent-primary-500"
              />
              <span className="text-xs text-secondary w-8">{volume}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
