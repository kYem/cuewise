import { describe, expect, it } from 'vitest';
import { decidePlayerErrorAction } from './youtube-player';

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
