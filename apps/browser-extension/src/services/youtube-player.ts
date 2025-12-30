/**
 * YouTube Player Service
 *
 * Controls YouTube playlist playback via an embedded iframe using the YouTube IFrame API.
 * Uses postMessage for play/pause/volume control without needing external scripts.
 *
 * Note: In Chrome extensions, iframes don't send Referer headers which causes YouTube
 * Error 153. As a fallback, we can open YouTube in a popup window.
 */

import { logger } from '@cuewise/shared';

/**
 * Playlist metadata returned from YouTube
 */
export interface PlaylistMetadata {
  title: string;
  thumbnailUrl: string;
  author?: string;
}

/**
 * Fetch playlist metadata from YouTube using oEmbed endpoint
 * Falls back to fetching the playlist page HTML if oEmbed fails
 */
export async function fetchPlaylistMetadata(playlistId: string): Promise<PlaylistMetadata | null> {
  try {
    // Try oEmbed first (works for playlists)
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/playlist?list=${playlistId}`
    )}&format=json`;

    const response = await fetch(oembedUrl);

    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || `Playlist ${playlistId.substring(0, 8)}`,
        thumbnailUrl: data.thumbnail_url || `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`,
        author: data.author_name,
      };
    }

    // If oEmbed fails, try fetching the playlist page directly
    logger.debug('oEmbed failed, trying direct fetch', { playlistId });
    return await fetchPlaylistMetadataFromPage(playlistId);
  } catch (error) {
    logger.error('Error fetching playlist metadata', error);
    return null;
  }
}

/**
 * Fetch playlist metadata by parsing the YouTube playlist page
 */
async function fetchPlaylistMetadataFromPage(playlistId: string): Promise<PlaylistMetadata | null> {
  try {
    const pageUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
    const response = await fetch(pageUrl);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // Extract title from og:title meta tag
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : `Playlist ${playlistId.substring(0, 8)}`;

    // Extract thumbnail from og:image meta tag
    const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    const thumbnailUrl = thumbnailMatch
      ? thumbnailMatch[1]
      : `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`;

    return { title, thumbnailUrl };
  } catch (error) {
    logger.error('Error fetching playlist page', error);
    return null;
  }
}

// YouTube Player state constants
const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  isReady: boolean;
  currentPlaylistId: string | null;
  volume: number;
}

class YouTubePlayerService {
  private iframe: HTMLIFrameElement | null = null;
  private container: HTMLDivElement | null = null;
  private state: PlayerState = {
    isPlaying: false,
    isPaused: false,
    isReady: false,
    currentPlaylistId: null,
    volume: 50,
  };
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private onStateChangeCallbacks: Array<(state: PlayerState) => void> = [];

  /**
   * Initialize the YouTube player by creating a hidden iframe
   */
  initialize(): void {
    if (this.iframe) {
      logger.debug('YouTube player already initialized');
      return;
    }

    // Create container for the iframe - hidden by default, shown in Now Playing view
    this.container = document.createElement('div');
    this.container.id = 'youtube-player-container';
    this.container.style.cssText = `
      position: fixed;
      bottom: -9999px;
      left: -9999px;
      width: 1px;
      height: 1px;
      overflow: hidden;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);

    // Set up message handler for YouTube API responses
    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener('message', this.messageHandler);

    logger.info('YouTube player service initialized', { origin: window.location.origin });
  }

  /**
   * Load and play a YouTube playlist
   * @param playlistId - YouTube playlist ID
   * @param firstVideoId - First video ID in the playlist (required for proper embedding)
   * @param autoplay - Whether to autoplay the video
   */
  loadPlaylist(playlistId: string, firstVideoId: string, _autoplay = true): void {
    if (!this.container) {
      this.initialize();
    }

    // Remove existing iframe if any
    if (this.iframe) {
      this.iframe.remove();
    }

    // Build the embed URL using YouTube's recommended format:
    // https://www.youtube.com/embed/VIDEO_ID?list=PLAYLIST_ID
    // Note: autoplay=0 because autoplay is blocked in extension context
    // User needs to click play button in the Now Playing panel
    const params = new URLSearchParams({
      list: playlistId,
      autoplay: '0', // Autoplay blocked in extension iframes
      controls: '1',
      rel: '0',
      enablejsapi: '1', // Enable JavaScript API for postMessage communication
    });

    // Use regular youtube.com - nocookie domain has stricter policies in extensions
    const embedUrl = `https://www.youtube.com/embed/${firstVideoId}?${params.toString()}`;

    // Create iframe
    this.iframe = document.createElement('iframe');
    this.iframe.id = 'youtube-player-iframe';
    this.iframe.src = embedUrl;
    this.iframe.allow = 'autoplay; encrypted-media; accelerometer; gyroscope; picture-in-picture';
    this.iframe.setAttribute('allowfullscreen', '');
    // Set referrer policy to ensure YouTube receives referrer info
    this.iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    // Iframe fills its container
    this.iframe.style.cssText = 'width: 100%; height: 100%; border: none; display: block;';

    // Handle iframe load
    this.iframe.onload = () => {
      this.state.isReady = true;
      this.state.currentPlaylistId = playlistId;

      // Apply saved volume after load
      setTimeout(() => {
        this.setVolume(this.state.volume);
      }, 1000);

      logger.info('YouTube iframe loaded successfully', { playlistId });
      this.notifyStateChange();
    };

    // Handle iframe errors
    this.iframe.onerror = (error) => {
      logger.error('YouTube iframe failed to load', { playlistId, error });
    };

    this.container?.appendChild(this.iframe);
    logger.info('Loading YouTube playlist', { playlistId, embedUrl });
  }

  /**
   * Send a command to the YouTube iframe via postMessage
   */
  private sendCommand(func: string, args?: unknown[]): void {
    if (!this.iframe?.contentWindow) {
      logger.warn('YouTube iframe not ready for commands');
      return;
    }

    const message = JSON.stringify({
      event: 'command',
      func,
      args: args || [],
    });

    logger.debug('YouTube sending command', { func, args });
    this.iframe.contentWindow.postMessage(message, '*');
  }

  /**
   * Handle messages from the YouTube iframe
   */
  private handleMessage(event: MessageEvent): void {
    // Only process messages from YouTube
    if (!event.origin.includes('youtube')) {
      return;
    }

    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      logger.debug('YouTube received message', { event: data.event, info: data.info });

      if (data.event === 'onStateChange') {
        this.handleStateChange(data.info);
      } else if (data.event === 'onReady') {
        logger.info('YouTube player ready event received');
      } else if (data.event === 'onError') {
        logger.error('YouTube player error', { errorCode: data.info });
      }
    } catch {
      // Not a JSON message, ignore
    }
  }

  /**
   * Handle YouTube player state changes
   */
  private handleStateChange(playerState: number): void {
    switch (playerState) {
      case PLAYER_STATE.PLAYING:
        this.state.isPlaying = true;
        this.state.isPaused = false;
        break;
      case PLAYER_STATE.PAUSED:
        this.state.isPlaying = false;
        this.state.isPaused = true;
        break;
      case PLAYER_STATE.ENDED:
        this.state.isPlaying = false;
        this.state.isPaused = false;
        break;
      case PLAYER_STATE.BUFFERING:
        // Keep current state during buffering
        break;
    }

    this.notifyStateChange();
  }

  /**
   * Play the video/playlist
   */
  play(): void {
    if (!this.state.isReady) {
      logger.warn('YouTube player not ready');
      return;
    }

    this.sendCommand('playVideo');
    this.state.isPlaying = true;
    this.state.isPaused = false;
    this.notifyStateChange();
    logger.debug('YouTube player: play');
  }

  /**
   * Pause the video/playlist
   */
  pause(): void {
    if (!this.state.isReady) {
      return;
    }

    this.sendCommand('pauseVideo');
    this.state.isPlaying = false;
    this.state.isPaused = true;
    this.notifyStateChange();
    logger.debug('YouTube player: pause');
  }

  /**
   * Stop playback and unload the playlist
   */
  stop(): void {
    if (!this.state.isReady) {
      return;
    }

    this.sendCommand('stopVideo');
    this.state.isPlaying = false;
    this.state.isPaused = false;
    this.notifyStateChange();
    logger.debug('YouTube player: stop');
  }

  /**
   * Set volume (0-100)
   */
  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(100, volume));
    this.state.volume = clampedVolume;

    if (this.state.isReady) {
      this.sendCommand('setVolume', [clampedVolume]);
    }

    this.notifyStateChange();
    logger.debug('YouTube player: setVolume', { volume: clampedVolume });
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.state.volume;
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.state.isPlaying;
  }

  /**
   * Check if paused
   */
  isPaused(): boolean {
    return this.state.isPaused;
  }

  /**
   * Check if player is ready
   */
  isReady(): boolean {
    return this.state.isReady;
  }

  /**
   * Get current playlist ID
   */
  getCurrentPlaylistId(): string | null {
    return this.state.currentPlaylistId;
  }

  /**
   * Get current state
   */
  getState(): PlayerState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: PlayerState) => void): () => void {
    this.onStateChangeCallbacks.push(callback);
    return () => {
      this.onStateChangeCallbacks = this.onStateChangeCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Notify all subscribers of state change
   */
  private notifyStateChange(): void {
    const state = this.getState();
    for (const callback of this.onStateChangeCallbacks) {
      callback(state);
    }
  }

  /**
   * Skip to next video in playlist
   */
  nextVideo(): void {
    if (this.state.isReady) {
      this.sendCommand('nextVideo');
      logger.debug('YouTube player: nextVideo');
    }
  }

  /**
   * Skip to previous video in playlist
   */
  previousVideo(): void {
    if (this.state.isReady) {
      this.sendCommand('previousVideo');
      logger.debug('YouTube player: previousVideo');
    }
  }

  /**
   * Toggle shuffle mode
   */
  setShuffle(shuffle: boolean): void {
    if (this.state.isReady) {
      this.sendCommand('setShuffle', [shuffle]);
      logger.debug('YouTube player: setShuffle', { shuffle });
    }
  }

  /**
   * Clean up the player
   */
  destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }

    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    this.state = {
      isPlaying: false,
      isPaused: false,
      isReady: false,
      currentPlaylistId: null,
      volume: 50,
    };

    this.onStateChangeCallbacks = [];
    logger.debug('YouTube player destroyed');
  }
}

// Singleton instance
export const youtubePlayer = new YouTubePlayerService();

/**
 * Open YouTube playlist in a popup window as fallback for extension iframe issues
 * Chrome extensions don't send Referer headers with iframes, causing Error 153
 */
export function openYouTubePopup(playlistId: string, firstVideoId?: string): void {
  const url = firstVideoId
    ? `https://www.youtube.com/watch?v=${firstVideoId}&list=${playlistId}`
    : `https://www.youtube.com/playlist?list=${playlistId}`;

  // Open small popup window for music playback
  window.open(
    url,
    'youtube-music',
    'width=400,height=300,menubar=no,toolbar=no,location=no,status=no'
  );

  logger.info('Opened YouTube in popup window', { playlistId });
}
