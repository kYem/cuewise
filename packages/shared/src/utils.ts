import {
  format,
  isToday as isTodayDateFns,
  isSameDay,
  parseISO,
  startOfDay,
  subDays,
} from 'date-fns';
import type { Quote } from './types';

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Format date to readable string (e.g., "January 15, 2025")
 */
export function formatDate(dateString: string): string {
  return format(parseISO(dateString), 'MMMM d, yyyy');
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
 * Get a random item from an array
 */
export function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Filter out hidden and get a random quote from a list
 */
export function getRandomQuote(quotes: Quote[]): Quote | null {
  const visibleQuotes = quotes.filter((q) => !q.isHidden);
  if (visibleQuotes.length === 0) return null;
  return getRandomItem(visibleQuotes);
}

/**
 * Calculate streak from sessions/goals
 * @param dates - Array of ISO date strings
 * @returns Object with current and longest streak counts
 */
export function calculateStreak(dates: string[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };

  // Parse and normalize dates to start of day, remove duplicates
  const uniqueDates = [...new Set(dates)]
    .map((dateStr) => startOfDay(parseISO(dateStr)))
    .sort((a, b) => b.getTime() - a.getTime()); // Sort descending (newest first)

  let current = 0;
  let longest = 0;
  let tempStreak = 0;

  for (let i = 0; i < uniqueDates.length; i++) {
    const expectedDate = startOfDay(subDays(new Date(), i));

    if (isSameDay(uniqueDates[i], expectedDate)) {
      tempStreak++;
      if (i === 0 || current > 0) {
        current = tempStreak;
      }
    } else {
      if (tempStreak > longest) {
        longest = tempStreak;
      }
      tempStreak = 0;
    }
  }

  return {
    current,
    longest: Math.max(longest, tempStreak),
  };
}

/**
 * Get current timestamp as ISO string
 */
export function getCurrentISOTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get ISO timestamp from a Date object
 */
export function getISOTimestamp(date: Date): string {
  return date.toISOString();
}

/**
 * Format a Date object for clock display (e.g., "02:30 PM")
 */
export function formatClockTime(date: Date): { time: string; period: string } {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;

  return {
    time: `${displayHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
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
 * Get greeting based on time of day
 */
export function getGreeting(date: Date): string {
  const hours = date.getHours();
  if (hours < 12) return 'Good Morning';
  if (hours < 18) return 'Good Afternoon';
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
