import { parseISO, subDays } from 'date-fns';
import {
  POSTURE_SAMPLE_INTERVAL_SECONDS,
  type PostureDailyStat,
  type PostureStatus,
} from './types';
import { formatDateString } from './utils';

/** Daily rollups older than this are pruned (on load and on each flush). */
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
  const cutoff = formatDateString(subDays(parseISO(today), POSTURE_STATS_RETENTION_DAYS));
  return stats.filter((stat) => stat.date >= cutoff);
}

// Upright = good + mild over present time: the nudge only fires on 'poor', so the
// score and the glow agree on what counts. Absent (away) is excluded entirely.
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
  // The week figure pools raw counts (time-weighted): a full workday counts for
  // more than a ten-minute session, unlike a plain mean of daily percentages.
  const weekCutoff = formatDateString(subDays(parseISO(today), 6));
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
