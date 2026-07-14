import { format, subDays } from 'date-fns';
import {
  POSTURE_SAMPLE_INTERVAL_SECONDS,
  type PostureDailyStat,
  type PostureStatus,
} from './types';

/** Daily rollups older than this are pruned — mirrors the sync retention. */
export const POSTURE_STATS_RETENTION_DAYS = 90;

export interface PostureSummary {
  todayPercent: number | null; // null = nothing tracked today
  sevenDayPercent: number | null; // last 7 days including today
  trackedHoursToday: number; // time present at the screen, in hours
}

function emptyCounts(): Record<PostureStatus, number> {
  return { good: 0, mild: 0, poor: 0, absent: 0 };
}

/** Roll one sample into the day's stat (pure — returns a new array). */
export function addPostureSample(
  stats: PostureDailyStat[],
  date: string,
  status: PostureStatus
): PostureDailyStat[] {
  const existing = stats.find((stat) => stat.date === date);
  if (existing === undefined) {
    return [...stats, { date, counts: { ...emptyCounts(), [status]: 1 } }];
  }
  return stats.map((stat) =>
    stat.date === date
      ? { ...stat, counts: { ...stat.counts, [status]: stat.counts[status] + 1 } }
      : stat
  );
}

/** Drop rollups older than the retention window (pure). */
export function prunePostureStats(stats: PostureDailyStat[], today: string): PostureDailyStat[] {
  const cutoff = format(
    subDays(new Date(`${today}T00:00:00`), POSTURE_STATS_RETENTION_DAYS),
    'yyyy-MM-dd'
  );
  return stats.filter((stat) => stat.date >= cutoff);
}

// Upright = not slouching (good + mild): mirrors the nudge threshold, which only
// fires on 'poor' — so the score and the glow agree on what counts. Absent
// (away from the screen) is excluded entirely.
function uprightPercent(stats: PostureDailyStat[]): number | null {
  let upright = 0;
  let present = 0;
  for (const stat of stats) {
    upright += stat.counts.good + stat.counts.mild;
    present += stat.counts.good + stat.counts.mild + stat.counts.poor;
  }
  if (present === 0) {
    return null;
  }
  return Math.round((upright / present) * 100);
}

/** Insights-card summary for a stats list; `today` is the local YYYY-MM-DD. */
export function summarizePosture(stats: PostureDailyStat[], today: string): PostureSummary {
  const todayStats = stats.filter((stat) => stat.date === today);
  const weekCutoff = format(subDays(new Date(`${today}T00:00:00`), 6), 'yyyy-MM-dd');
  const weekStats = stats.filter((stat) => stat.date >= weekCutoff && stat.date <= today);

  const presentToday = todayStats.reduce(
    (sum, stat) => sum + stat.counts.good + stat.counts.mild + stat.counts.poor,
    0
  );
  const trackedHoursToday =
    Math.round(((presentToday * POSTURE_SAMPLE_INTERVAL_SECONDS) / 3600) * 10) / 10;

  return {
    todayPercent: uprightPercent(todayStats),
    sevenDayPercent: uprightPercent(weekStats),
    trackedHoursToday,
  };
}
