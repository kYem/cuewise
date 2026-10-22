import { parseISO, subDays } from 'date-fns';
import type { HabitDay, Reminder } from './types';
import { dailyTargetOf, formatDateString, isActiveDay, targetDayOf } from './utils';

export const HABIT_HISTORY_RETENTION_DAYS = 365;

export interface HabitDayRecord {
  next: HabitDay[];
  changedId: string;
  prunedIds: string[];
}

export function habitDayId(reminderId: string, date: string): string {
  return `${reminderId}:${date}`;
}

/** One more done on `date`, dropping that habit's days that fell out of the retention window. */
export function recordHabitDay(days: HabitDay[], reminderId: string, date: string): HabitDayRecord {
  const cutoff = formatDateString(subDays(parseISO(date), HABIT_HISTORY_RETENTION_DAYS - 1));
  const expired = (entry: HabitDay) => entry.reminderId === reminderId && entry.date < cutoff;
  const prunedIds = days.filter(expired).map((entry) => entry.id);
  const kept = days.filter((entry) => !expired(entry));
  const id = habitDayId(reminderId, date);
  const existing = kept.find((entry) => entry.id === id);
  const next =
    existing === undefined
      ? [...kept, { id, reminderId, date, count: 1 }]
      : kept.map((entry) => (entry.id === id ? { ...entry, count: entry.count + 1 } : entry));
  return { next, changedId: id, prunedIds };
}

/** One day wider than a record's window: a habit's day can open the day before `now`. */
export function habitHistorySweepCutoff(now: Date): string {
  return formatDateString(subDays(now, HABIT_HISTORY_RETENTION_DAYS));
}

const RECENT_DAYS = 30;

export type HabitDayState = 'kept' | 'partial' | 'missed' | 'off' | 'pending';

export interface HabitDayCell {
  date: string;
  state: HabitDayState;
  count: number;
}

export interface HabitStats {
  current: number;
  best: number;
  rate30: number | null;
  last30: HabitDayCell[];
}

function breaksStreak(state: HabitDayState): boolean {
  return state === 'partial' || state === 'missed';
}

/**
 * Streaks walk the retention window, the same days `recordHabitDay` keeps: a kept day counts even
 * when off; an off day, a day before the first record or an unfinished today is skipped.
 */
export function getHabitStats(reminder: Reminder, days: HabitDay[], now: Date): HabitStats {
  const counts = new Map<string, number>();
  let firstRecorded: string | undefined;
  for (const entry of days) {
    if (entry.reminderId !== reminder.id) {
      continue;
    }
    counts.set(entry.date, entry.count);
    if (firstRecorded === undefined || entry.date < firstRecorded) {
      firstRecorded = entry.date;
    }
  }
  const target = dailyTargetOf(reminder) ?? 1;
  const activeHours =
    reminder.recurring?.frequency === 'interval' ? reminder.recurring.activeHours : undefined;
  const today = targetDayOf(reminder, now);

  const cellAt = (offset: number): HabitDayCell => {
    const day = subDays(today, offset);
    const date = formatDateString(day);
    const count = counts.get(date) ?? 0;
    if (count >= target) {
      return { date, state: 'kept', count };
    }
    const untracked = offset > 0 && (firstRecorded === undefined || date < firstRecorded);
    if (untracked || !isActiveDay(day, activeHours)) {
      return { date, state: 'off', count };
    }
    if (offset === 0) {
      return { date, state: 'pending', count };
    }
    return { date, state: count > 0 ? 'partial' : 'missed', count };
  };
  const cells = Array.from({ length: HABIT_HISTORY_RETENTION_DAYS }, (_, index) =>
    cellAt(HABIT_HISTORY_RETENTION_DAYS - 1 - index)
  );

  let best = 0;
  let run = 0;
  for (const { state } of cells) {
    if (state === 'kept') {
      run += 1;
      best = Math.max(best, run);
    } else if (breaksStreak(state)) {
      run = 0;
    }
  }
  let current = 0;
  for (let index = cells.length - 1; index >= 0 && !breaksStreak(cells[index].state); index -= 1) {
    if (cells[index].state === 'kept') {
      current += 1;
    }
  }

  const last30 = cells.slice(-RECENT_DAYS);
  const rated = last30.filter((cell) => cell.state !== 'off' && cell.state !== 'pending');
  const kept = rated.filter((cell) => cell.state === 'kept').length;
  const rate30 = rated.length === 0 ? null : Math.round((kept / rated.length) * 100);

  return { current, best, rate30, last30 };
}
