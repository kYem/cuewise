import { describe, expect, it } from 'vitest';
import { formatMillisAgo, formatReminderClock, formatTimeAgo } from './reminder-date-utils';

/** ISO timestamp `ms` in the past relative to now. */
function agoIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

/** ISO string for a Date at the given local hour/minute today (clock formatting is local-time). */
function localClockIso(hour: number, minute: number): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

describe('formatReminderClock', () => {
  it('formats afternoon time with an AM/PM period in 12h', () => {
    expect(formatReminderClock(localClockIso(17, 36), '12h')).toBe('5:36 PM');
  });

  it('formats the same time without a period in 24h', () => {
    expect(formatReminderClock(localClockIso(17, 36), '24h')).toBe('17:36');
  });
});

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

describe('formatMillisAgo', () => {
  it('accepts epoch millis directly (the lastSyncedAt domain)', () => {
    expect(formatMillisAgo(Date.now() - 26 * 60 * 1000)).toBe('26 min ago');
  });

  it('returns "Just now" for under a minute', () => {
    expect(formatMillisAgo(Date.now() - 30 * 1000)).toBe('Just now');
  });
});
