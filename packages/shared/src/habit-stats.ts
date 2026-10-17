import { parseISO, subDays } from 'date-fns';
import type { HabitDay } from './types';
import { formatDateString } from './utils';

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
