/**
 * Now Playing Tab
 *
 * Shows the YouTube video player embedded in the sounds panel.
 * The iframe is managed by youtube-player.ts service.
 *
 * IMPORTANT: We DON'T move the YouTube container in the DOM - that would cause
 * the iframe to reload and reset playback. Instead, we use CSS positioning to
 * overlay the container on top of this tab's video area.
 */

import { Loader2 } from 'lucide-react';
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useSoundsStore } from '../../stores/sounds-store';

export const NowPlayingTab: React.FC = () => {
  const activeSource = useSoundsStore((state) => state.activeSource);
  const isPlaying = useSoundsStore((state) => state.isPlaying);
  const isYoutubeLoading = useSoundsStore((state) => state.isYoutubeLoading);
  const getSelectedPlaylist = useSoundsStore((state) => state.getSelectedPlaylist);

  const videoAreaRef = useRef<HTMLDivElement>(null);

  const selectedPlaylist = getSelectedPlaylist();
  const isYoutubePlaying = activeSource === 'youtube' && isPlaying;
  const isYoutubeActive = activeSource === 'youtube';

  // Position the YouTube container over the video area using CSS (not DOM moves)
  useLayoutEffect(() => {
    const container = document.getElementById('youtube-player-container');
    const videoArea = videoAreaRef.current;

    if (!container || !videoArea) {
      return;
    }

    // Save original styles to restore on cleanup
    const originalStyles = container.style.cssText;

    // Function to update container position to match video area
    const updatePosition = () => {
      const rect = videoArea.getBoundingClientRect();
      // Only position if the element has valid dimensions
      if (rect.width > 0 && rect.height > 0) {
        const newStyles = `
          position: fixed;
          top: ${rect.top}px;
          left: ${rect.left}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          opacity: 1;
          pointer-events: auto;
          z-index: 200;
          border-radius: 8px;
          overflow: hidden;
        `;
        container.style.cssText = newStyles;
      }
    };

    // Initial position - use requestAnimationFrame to ensure DOM is laid out
    requestAnimationFrame(() => {
      updatePosition();
      // Double-check after a short delay in case popover animation affected layout
      setTimeout(updatePosition, 50);
    });

    // Update position on resize/scroll
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    // Cleanup: restore original hidden styles
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      container.style.cssText = originalStyles;
    };
  }, []);

  return (
    <div className="space-y-3">
      {/* Title */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-primary truncate">
          {selectedPlaylist?.name || 'Now Playing'}
        </h3>
        {isYoutubePlaying && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse flex-shrink-0" />
        )}
      </div>

      {/* Video Area - YouTube container will be positioned over this */}
      <div ref={videoAreaRef} className="aspect-video bg-black rounded-lg overflow-hidden relative">
        {/* Loading indicator shown while video is loading */}
        {isYoutubeLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
          </div>
        )}
        {/* Placeholder shown when YouTube is not active */}
        {!isYoutubeActive && (
          <div className="w-full h-full flex items-center justify-center text-white/50">
            <p className="text-sm">No video playing</p>
          </div>
        )}
      </div>
    </div>
  );
};
