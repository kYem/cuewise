import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decidePlayerErrorAction, isAllowedMessageOrigin, youtubePlayer } from './youtube-player';

/** Asserted rather than narrowed with `?.`, so a missing frame fails here and not downstream. */
function currentIframe(): HTMLIFrameElement {
  const iframe = document.querySelector('#youtube-player-iframe');
  expect(iframe).toBeInstanceOf(HTMLIFrameElement);
  return iframe as HTMLIFrameElement;
}

describe('the playlist a load is in flight for', () => {
  afterEach(() => {
    youtubePlayer.destroy();
  });

  it('is reported the moment the load starts, before the iframe reports back', () => {
    youtubePlayer.loadPlaylist('PL1', 'v1');

    expect(youtubePlayer.getRequestedPlaylistId()).toBe('PL1');
    expect(youtubePlayer.getCurrentPlaylistId()).toBeNull();
  });

  it('follows the newest load rather than latching on the one it replaced', () => {
    youtubePlayer.loadPlaylist('PL1', 'v1');
    youtubePlayer.loadPlaylist('PL2', 'v2');

    expect(youtubePlayer.getRequestedPlaylistId()).toBe('PL2');
  });

  it('is released by a stop, so the next play is not taken for it still loading', () => {
    youtubePlayer.loadPlaylist('PL1', 'v1');
    youtubePlayer.stop();

    expect(youtubePlayer.getRequestedPlaylistId()).toBeNull();
  });

  it('is released when the iframe fails, so the next request retries', () => {
    youtubePlayer.loadPlaylist('PL1', 'v1');
    currentIframe().dispatchEvent(new Event('error'));

    expect(youtubePlayer.getRequestedPlaylistId()).toBeNull();
  });

  it('is not released by a frame the newer load already replaced', () => {
    youtubePlayer.loadPlaylist('PL1', 'v1');
    const superseded = currentIframe();
    youtubePlayer.loadPlaylist('PL2', 'v2');
    superseded.dispatchEvent(new Event('error'));

    expect(youtubePlayer.getRequestedPlaylistId()).toBe('PL2');
  });

  it('is forgotten when the player is destroyed', () => {
    youtubePlayer.loadPlaylist('PL1', 'v1');
    youtubePlayer.destroy();

    expect(youtubePlayer.getRequestedPlaylistId()).toBeNull();
  });
});

describe('a load that is no longer wanted', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    youtubePlayer.destroy();
    vi.useRealTimers();
  });

  it('is not adopted when it lands after a stop', () => {
    const onReady = vi.fn();
    youtubePlayer.loadPlaylist('PL1', 'v1', onReady);
    const iframe = currentIframe();
    youtubePlayer.stop();
    iframe.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(2000);

    expect(onReady).not.toHaveBeenCalled();
    expect(youtubePlayer.getCurrentPlaylistId()).toBeNull();
  });

  it('is not adopted when a newer load has replaced it', () => {
    const onReady = vi.fn();
    youtubePlayer.loadPlaylist('PL1', 'v1', onReady);
    const superseded = currentIframe();
    youtubePlayer.loadPlaylist('PL2', 'v2');
    superseded.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(2000);

    expect(onReady).not.toHaveBeenCalled();
    expect(youtubePlayer.getCurrentPlaylistId()).toBeNull();
  });

  it('stops reporting the playlist it replaced while the new one loads', () => {
    youtubePlayer.loadPlaylist('PL1', 'v1');
    currentIframe().dispatchEvent(new Event('load'));
    expect(youtubePlayer.getCurrentPlaylistId()).toBe('PL1');

    youtubePlayer.loadPlaylist('PL2', 'v2');

    expect(youtubePlayer.getCurrentPlaylistId()).toBeNull();
  });
});

// 100 = removed, 101 & 150 = embedding disabled by the owner (per-video failures).
describe('decidePlayerErrorAction', () => {
  it('skips a per-video failure within a playlist', () => {
    expect(decidePlayerErrorAction(150, true, 0)).toBe('skip');
    expect(decidePlayerErrorAction(101, true, 2)).toBe('skip');
    expect(decidePlayerErrorAction(100, true, 4)).toBe('skip'); // the 5th skip is still allowed
  });

  it('gives up once too many tracks fail in a row', () => {
    expect(decidePlayerErrorAction(150, true, 5)).toBe('give-up'); // this would be the 6th
  });

  it('notifies without skipping for a non-recoverable error code', () => {
    expect(decidePlayerErrorAction(2, true, 0)).toBe('notify');
    expect(decidePlayerErrorAction(5, true, 0)).toBe('notify');
  });

  it('notifies without skipping when there is no playlist to advance', () => {
    expect(decidePlayerErrorAction(150, false, 0)).toBe('notify');
  });
});

describe('isAllowedMessageOrigin', () => {
  it('allows the cuewise.app proxy and the youtube-nocookie embed', () => {
    expect(isAllowedMessageOrigin('https://cuewise.app')).toBe(true);
    expect(isAllowedMessageOrigin('https://www.youtube-nocookie.com')).toBe(true);
  });

  it('rejects lookalike origins that a substring check would have matched', () => {
    expect(isAllowedMessageOrigin('https://evil-youtube.com')).toBe(false);
    expect(isAllowedMessageOrigin('https://cuewise.app.attacker.com')).toBe(false);
    expect(isAllowedMessageOrigin('https://www.youtube.com')).toBe(false);
  });

  it('rejects unrelated and empty origins', () => {
    expect(isAllowedMessageOrigin('https://attacker.com')).toBe(false);
    expect(isAllowedMessageOrigin('')).toBe(false);
  });
});
