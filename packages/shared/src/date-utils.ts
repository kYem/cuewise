import { addDays, format, isToday as isTodayDateFns, parseISO, subDays } from 'date-fns';

/** Format a Date as a local (not UTC) YYYY-MM-DD string. */
export function formatDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  return formatDateString(new Date());
}

/**
 * Get tomorrow's date in YYYY-MM-DD format
 */
export function getNextDayDateString(): string {
  return getDateStringDaysFromNow(1);
}

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
export function getYesterdayDateString(): string {
  return getDateStringDaysAgo(1);
}

/**
 * Get the date N days before today in YYYY-MM-DD format (local time)
 */
export function getDateStringDaysAgo(days: number): string {
  return formatDateString(subDays(new Date(), days));
}

/**
 * Get the date N days after today in YYYY-MM-DD format (local time)
 */
export function getDateStringDaysFromNow(days: number): string {
  return formatDateString(addDays(new Date(), days));
}

/**
 * Check if current time is past the specified goal transfer hour
 * @param transferHour - Hour in 24-hour format (0-23)
 * @returns true if current time is past the transfer hour
 */
export function isPastGoalTransferTime(transferHour: number): boolean {
  const now = new Date();
  const currentHour = now.getHours();
  return currentHour >= transferHour;
}

/**
 * Format date to readable string (e.g., "January 15, 2025")
 */
export function formatDate(dateString: string): string {
  return format(parseISO(dateString), 'MMMM d, yyyy');
}

/**
 * Create a Date object for a specific time today, or tomorrow if that time has already passed.
 * Useful for scheduling reminders at a specific time.
 *
 * @param hour - Hour in 24-hour format (0-23)
 * @param minute - Minute (0-59), defaults to 0
 * @returns Date object set to the specified time today or tomorrow
 *
 * @example
 * // If it's currently 3:00 PM
 * createScheduledDate(10, 0);  // Returns tomorrow at 10:00 AM
 * createScheduledDate(17, 30); // Returns today at 5:30 PM
 */
export function createScheduledDate(hour: number, minute = 0): Date {
  const now = new Date();
  const scheduledDate = new Date();
  scheduledDate.setHours(hour, minute, 0, 0);

  // If the time has already passed today, schedule for tomorrow
  if (scheduledDate <= now) {
    scheduledDate.setDate(scheduledDate.getDate() + 1);
  }

  return scheduledDate;
}

/**
 * Format time to readable string (e.g., "2:30 PM")
 */
export function formatTime(dateString: string): string {
  return format(parseISO(dateString), 'h:mm a');
}

/**
 * Check if a date string (YYYY-MM-DD) is today
 */
export function isToday(dateString: string): boolean {
  return isTodayDateFns(parseISO(dateString));
}

/**
 * Get relative date label for display (e.g., "Today", "Yesterday", "Tomorrow")
 * Returns formatted date string for dates beyond tomorrow
 */
export function getRelativeDateLabel(dateString: string): string {
  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();
  const tomorrow = getNextDayDateString();

  if (dateString === today) {
    return 'Today';
  }
  if (dateString === yesterday) {
    return 'Yesterday';
  }
  if (dateString === tomorrow) {
    return 'Tomorrow';
  }

  return formatDate(dateString);
}

/**
 * Calculate the number of days between two dates
 * @param fromDate - Start date in YYYY-MM-DD format
 * @param toDate - End date in YYYY-MM-DD format
 * @returns Number of days (positive if toDate is after fromDate)
 */
export function daysBetween(fromDate: string, toDate: string): number {
  const from = parseISO(fromDate);
  const to = parseISO(toDate);
  const diffTime = to.getTime() - from.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
