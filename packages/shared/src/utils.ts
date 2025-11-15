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
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Format date to readable string
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time to readable string
 */
export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Check if a date is today
 */
export function isToday(dateString: string): boolean {
  return dateString === getTodayDateString();
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
 */
export function calculateStreak(dates: string[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };

  const sortedDates = [...new Set(dates)].sort().reverse();
  let current = 0;
  let longest = 0;
  let tempStreak = 0;

  for (let i = 0; i < sortedDates.length; i++) {
    const date = new Date(sortedDates[i]);
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() - i);
    expectedDate.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    if (date.getTime() === expectedDate.getTime()) {
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
