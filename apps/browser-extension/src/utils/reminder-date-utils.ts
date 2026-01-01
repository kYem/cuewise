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

/**
 * Format the due date in a human-readable way
 */
export function formatDueDate(dueDate: string): DueDateInfo {
  const date = parseISO(dueDate);
  const now = new Date();
  const minutesUntil = differenceInMinutes(date, now);
  const overdue = isPast(date) && !isToday(date);

  // Consider "soon" if within 5 minutes
  const isSoon = minutesUntil >= 0 && minutesUntil <= 5;

  if (isToday(date)) {
    return {
      text: `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      isOverdue: false,
      isSoon,
      minutesUntil,
    };
  }

  if (isTomorrow(date)) {
    return {
      text: `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
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
