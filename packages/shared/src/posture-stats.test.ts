import { describe, expect, it } from 'vitest';
import {
  addPostureSample,
  type PostureDailyStat,
  prunePostureStats,
  summarizePosture,
} from './index';

function stat(date: string, counts: Partial<PostureDailyStat['counts']>): PostureDailyStat {
  return { date, counts: { good: 0, mild: 0, poor: 0, absent: 0, ...counts } };
}

describe('addPostureSample', () => {
  it('creates the day on first sample and increments after', () => {
    let stats = addPostureSample([], '2026-07-14', 'good');
    stats = addPostureSample(stats, '2026-07-14', 'good');
    stats = addPostureSample(stats, '2026-07-14', 'poor');

    expect(stats).toEqual([stat('2026-07-14', { good: 2, poor: 1 })]);
  });

  it('keeps other days untouched and does not mutate its input', () => {
    const before = [stat('2026-07-13', { good: 5 })];
    const after = addPostureSample(before, '2026-07-14', 'mild');

    expect(before).toEqual([stat('2026-07-13', { good: 5 })]);
    expect(after).toHaveLength(2);
  });
});

describe('summarizePosture', () => {
  it('reports nulls and zero hours when nothing was tracked', () => {
    expect(summarizePosture([], '2026-07-14')).toEqual({
      todayPercent: null,
      sevenDayPercent: null,
      trackedHoursToday: 0,
    });
  });

  it('excludes absent time from the score entirely', () => {
    const stats = [stat('2026-07-14', { absent: 500 })];

    expect(summarizePosture(stats, '2026-07-14').todayPercent).toBeNull();
  });

  it('counts good and mild as upright, matching the nudge threshold', () => {
    // 60 good + 20 mild upright of 100 present → 80%.
    const stats = [stat('2026-07-14', { good: 60, mild: 20, poor: 20, absent: 30 })];
    const summary = summarizePosture(stats, '2026-07-14');

    expect(summary.todayPercent).toBe(80);
    // 100 present samples × 2s = 200s ≈ 0.1h.
    expect(summary.trackedHoursToday).toBe(0.1);
  });

  it('pools the seven-day window by time and ignores older days', () => {
    const stats = [
      stat('2026-07-14', { good: 100 }), // today: 100% over 100 samples
      stat('2026-07-08', { poor: 300 }), // 6 days ago: 0% over 300 samples
      stat('2026-07-07', { poor: 400 }), // 7 days ago: outside
    ];
    const summary = summarizePosture(stats, '2026-07-14');

    // 100 upright of 400 present = 25%. A plain mean of daily percentages would
    // say 50% — the long day must outweigh the short one.
    expect(summary.sevenDayPercent).toBe(25);
  });
});

describe('prunePostureStats', () => {
  it('keeps the retention window and drops older days', () => {
    const stats = [
      stat('2026-07-14', { good: 1 }),
      stat('2026-04-16', { good: 1 }), // within 90 days
      stat('2026-01-01', { good: 1 }), // long gone
    ];

    const pruned = prunePostureStats(stats, '2026-07-14');

    expect(pruned.map((s) => s.date)).toEqual(['2026-07-14', '2026-04-16']);
  });

  it('fills in count keys missing from a persisted blob (version skew)', () => {
    const skewed = [{ date: '2026-07-14', counts: { good: 5 } }] as unknown as PostureDailyStat[];

    const pruned = prunePostureStats(skewed, '2026-07-14');

    expect(pruned[0]).toEqual(stat('2026-07-14', { good: 5 }));
    // The healed counts must be safe for the arithmetic downstream — no NaN.
    expect(summarizePosture(pruned, '2026-07-14').todayPercent).toBe(100);
  });

  it('treats a non-array blob as no data instead of throwing', () => {
    const garbage = { not: 'an array' } as unknown as PostureDailyStat[];

    expect(prunePostureStats(garbage, '2026-07-14')).toEqual([]);
  });
});
