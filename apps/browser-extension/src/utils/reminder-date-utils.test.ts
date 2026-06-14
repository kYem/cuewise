import { describe, expect, it } from 'vitest';
import { formatTimeAgo } from './reminder-date-utils';

/** ISO timestamp `ms` in the past relative to now. */
function agoIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe('formatTimeAgo', () => {
  it('returns "Just now" for under a minute', () => {
    expect(formatTimeAgo(agoIso(30 * 1000))).toBe('Just now');
  });

  it('returns "N min ago" for minutes', () => {
    expect(formatTimeAgo(agoIso(26 * 60 * 1000))).toBe('26 min ago');
  });

  it('returns "Nh ago" for hours', () => {
    expect(formatTimeAgo(agoIso(3 * 60 * 60 * 1000))).toBe('3h ago');
  });

  it('returns "Nd ago" for days', () => {
    expect(formatTimeAgo(agoIso(2 * 24 * 60 * 60 * 1000))).toBe('2d ago');
  });
});
