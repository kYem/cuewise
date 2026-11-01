import { format } from 'date-fns';

/**
 * Format a Date object for clock display
 * 12h format: "02:30 PM", 24h format: "14:30"
 */
export function formatClockTime(
  date: Date,
  format: '12h' | '24h' = '12h'
): { time: string; period: string } {
  return formatWallClockTime(date.getHours(), date.getMinutes(), format);
}

/** `formatClockTime` for a wall-clock time that isn't the device's, e.g. another zone's. */
export function formatWallClockTime(
  hours: number,
  minutes: number,
  format: '12h' | '24h'
): { time: string; period: string } {
  if (format === '24h') {
    return {
      time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      period: '',
    };
  }

  // 12-hour format
  const period = hours >= 12 ? 'PM' : 'AM';
  let displayHours = hours % 12;
  if (displayHours === 0) {
    displayHours = 12;
  }

  return {
    time: `${displayHours}:${minutes.toString().padStart(2, '0')}`,
    period,
  };
}

/**
 * Format a Date object to long date string (e.g., "Monday, January 15, 2025")
 */
export function formatLongDate(date: Date): string {
  return format(date, 'EEEE, MMMM d, yyyy');
}

/**
 * Format hour and minute as a 12-hour time string (e.g., "10 AM", "2:30 PM")
 * Omits minutes if they are zero.
 *
 * @param hour - Hour in 24-hour format (0-23)
 * @param minute - Minute (0-59), defaults to 0
 * @returns Formatted time string like "10 AM" or "2:30 PM"
 */
export function formatHourMinute(hour: number, minute = 0): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  let displayHour = hour % 12;
  if (displayHour === 0) {
    displayHour = 12;
  }

  if (minute === 0) {
    return `${displayHour}:00 ${period}`;
  }

  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

/**
 * Get greeting based on time of day
 */
export function getGreeting(date: Date): string {
  const hours = date.getHours();
  if (hours < 12) {
    return 'Good Morning';
  }
  if (hours < 18) {
    return 'Good Afternoon';
  }
  return 'Good Evening';
}

/**
 * Format seconds to mm:ss format
 */
export function formatTimeRemaining(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convert minutes to seconds
 */
export function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}
