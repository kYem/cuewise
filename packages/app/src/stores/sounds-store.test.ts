import { describe, expect, it } from 'vitest';
import { extractYouTubeInfo } from './sounds-store';

describe('extractYouTubeInfo', () => {
  it('accepts youtube.com, www.youtube.com, m.youtube.com, music.youtube.com, and youtu.be', () => {
    expect(extractYouTubeInfo('https://youtube.com/playlist?list=PL123')).toEqual({
      playlistId: 'PL123',
      videoId: undefined,
    });
    expect(extractYouTubeInfo('https://www.youtube.com/playlist?list=PL123')).toEqual({
      playlistId: 'PL123',
      videoId: undefined,
    });
    expect(extractYouTubeInfo('https://m.youtube.com/playlist?list=PL123')).toEqual({
      playlistId: 'PL123',
      videoId: undefined,
    });
    expect(extractYouTubeInfo('https://music.youtube.com/playlist?list=PL123')).toEqual({
      playlistId: 'PL123',
      videoId: undefined,
    });
    expect(extractYouTubeInfo('https://youtu.be/?list=PL123')).toEqual({
      playlistId: 'PL123',
      videoId: undefined,
    });
  });

  it('extracts the video id alongside the playlist id when present', () => {
    expect(extractYouTubeInfo('https://www.youtube.com/watch?v=abc123&list=PL123')).toEqual({
      playlistId: 'PL123',
      videoId: 'abc123',
    });
  });

  it('rejects a spoofed host that a substring check would have matched', () => {
    expect(extractYouTubeInfo('https://youtube.com.evil.com/playlist?list=PL123')).toBeNull();
    expect(extractYouTubeInfo('https://notyoutube.com/playlist?list=PL123')).toBeNull();
    expect(extractYouTubeInfo('https://evilyoutu.be/?list=PL123')).toBeNull();
  });

  it('rejects a valid host with no list param, and an unparseable url', () => {
    expect(extractYouTubeInfo('https://www.youtube.com/watch?v=abc123')).toBeNull();
    expect(extractYouTubeInfo('not a url')).toBeNull();
  });
});
