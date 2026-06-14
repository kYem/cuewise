import { formatClockTime } from '@cuewise/shared';
import {
  differenceInMinutes,
  differenceInSeconds,
  formatDistanceToNow,
  isPast,
  isToday,
  isTomorrow,
  parseISO,
} from 'date-fns';

export interface DueDateInfo {
  text: string;
  isOverdue: boolean;
  isSoon: boolean;
  minutesUntil: number;
}

/** Clock time for a reminder respecting the user's 12h/24h setting: "5:36 PM" or "17:36". */
export function formatReminderClock(dueDate: string, timeFormat: '12h' | '24h'): string {
  const { time, period } = formatClockTime(parseISO(dueDate), timeFormat);
  return period ? `${time} ${period}` : time;
}

/** Compact uppercase day label for upcoming rows: "TMRW", a short weekday, or a short date. */
export function dayLabel(dueDate: string): string {
  const date = parseISO(dueDate);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tmrw'.toUpperCase();
  }
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days >= 0 && days < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

/**
 * Format the due date in a human-readable way
 */
export function formatDueDate(dueDate: string, timeFormat: '12h' | '24h' = '12h'): DueDateInfo {
  const date = parseISO(dueDate);
  const now = new Date();
  const minutesUntil = differenceInMinutes(date, now);
  const overdue = isPast(date) && !isToday(date);

  // Consider "soon" if within 5 minutes
  const isSoon = minutesUntil >= 0 && minutesUntil <= 5;

  if (isToday(date)) {
    return {
      text: `Today at ${formatReminderClock(dueDate, timeFormat)}`,
      isOverdue: false,
      isSoon,
      minutesUntil,
    };
  }

  if (isTomorrow(date)) {
    return {
      text: `Tomorrow at ${formatReminderClock(dueDate, timeFormat)}`,
      isOverdue: false,
      isSoon: false,
      minutesUntil,
    };
  }

  if (overdue) {
    return {
      text: formatDistanceToNow(date, { addSuffix: true }),
      isOverdue: true,
      isSoon: false,
      minutesUntil,
    };
  }

  return {
    text: `in ${formatDistanceToNow(date)}`,
    isOverdue: false,
    isSoon: false,
    minutesUntil,
  };
}

/** Compact "time since" for overdue/fired reminders: "Just now", "26 min ago", "3h ago", "2d ago". */
export function formatTimeAgo(dueDate: string): string {
  const seconds = Math.round((Date.now() - parseISO(dueDate).getTime()) / 1000);
  if (seconds < 60) {
    return 'Just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Format countdown for reminders that are very close (within 5 minutes)
 */
export function formatCountdown(dueDate: string): string {
  const date = parseISO(dueDate);
  const now = new Date();
  const seconds = differenceInSeconds(date, now);

  if (seconds < 0) {
    return 'Now!';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
