import {
  format,
  isAfter,
  isSameDay,
  isToday as isTodayDateFns,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import type { Goal, InsightsData, PomodoroSession, Quote, QuoteCategory } from './types';

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
 * Excludes the current quote if provided to prevent consecutive duplicates
 */
export function getRandomQuote(quotes: Quote[], currentQuoteId?: string): Quote | null {
  const visibleQuotes = quotes.filter((q) => !q.isHidden);
  if (visibleQuotes.length === 0) return null;

  // If only one visible quote, return it (no choice)
  if (visibleQuotes.length === 1) return visibleQuotes[0];

  // If current quote ID provided, exclude it from selection
  if (currentQuoteId) {
    const otherQuotes = visibleQuotes.filter((q) => q.id !== currentQuoteId);
    if (otherQuotes.length > 0) {
      return getRandomItem(otherQuotes);
    }
  }

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
 * Format a Date object for clock display
 * 12h format: "02:30 PM", 24h format: "14:30"
 */
export function formatClockTime(
  date: Date,
  format: '12h' | '24h' = '12h'
): { time: string; period: string } {
  const hours = date.getHours();
  const minutes = date.getMinutes();

  if (format === '24h') {
    return {
      time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      period: '',
    };
  }

  // 12-hour format
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

/**
 * Calculate insights data from quotes, goals, and pomodoro sessions
 */
export function calculateInsights(
  quotes: Quote[],
  goals: Goal[],
  pomodoroSessions: PomodoroSession[]
): InsightsData {
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const monthStart = startOfMonth(today);

  // Total quotes viewed (sum of all view counts)
  const totalQuotesViewed = quotes.reduce((sum, quote) => sum + quote.viewCount, 0);

  // Quotes viewed this week
  const quotesViewedThisWeek = quotes.reduce((sum, quote) => {
    if (quote.lastViewed) {
      const viewedDate = parseISO(quote.lastViewed);
      if (isAfter(viewedDate, weekStart) || isSameDay(viewedDate, weekStart)) {
        return sum + 1;
      }
    }
    return sum;
  }, 0);

  // Goals completed today
  const goalsCompletedToday = goals.filter((goal) => {
    if (!goal.completed) return false;
    const goalDate = parseISO(goal.date);
    return isSameDay(goalDate, today);
  }).length;

  // Goals completed this week
  const goalsCompletedThisWeek = goals.filter((goal) => {
    if (!goal.completed) return false;
    const goalDate = parseISO(goal.date);
    return isAfter(goalDate, weekStart) || isSameDay(goalDate, weekStart);
  }).length;

  // Goals completed this month
  const goalsCompletedThisMonth = goals.filter((goal) => {
    if (!goal.completed) return false;
    const goalDate = parseISO(goal.date);
    return isAfter(goalDate, monthStart) || isSameDay(goalDate, monthStart);
  }).length;

  // Pomodoros completed today
  const pomodorosCompletedToday = pomodoroSessions.filter((session) => {
    if (session.interrupted || session.type !== 'work') return false;
    const sessionDate = parseISO(session.completedAt || session.startedAt);
    return isSameDay(sessionDate, today);
  }).length;

  // Category view counts
  const categoryViewCounts: Record<QuoteCategory, number> = {
    inspiration: 0,
    learning: 0,
    productivity: 0,
    mindfulness: 0,
    success: 0,
    creativity: 0,
    resilience: 0,
    leadership: 0,
    health: 0,
    growth: 0,
  };

  quotes.forEach((quote) => {
    if (quote.viewCount > 0) {
      categoryViewCounts[quote.category] += quote.viewCount;
    }
  });

  // Calculate streak based on goal completion dates
  const completedGoalDates = goals.filter((goal) => goal.completed).map((goal) => goal.date); // YYYY-MM-DD format

  const streakData = calculateStreak(completedGoalDates);

  // Find the last active date
  const lastActiveDate =
    completedGoalDates.length > 0 ? completedGoalDates.sort().reverse()[0] : getTodayDateString();

  return {
    totalQuotesViewed,
    quotesViewedThisWeek,
    goalsCompletedToday,
    goalsCompletedThisWeek,
    goalsCompletedThisMonth,
    pomodorosCompletedToday,
    categoryViewCounts,
    streak: {
      current: streakData.current,
      longest: streakData.longest,
      lastActive: lastActiveDate,
    },
  };
}

/**
 * Get category with most views
 */
export function getMostViewedCategory(
  categoryViewCounts: Record<QuoteCategory, number>
): { category: QuoteCategory; count: number } | null {
  const entries = Object.entries(categoryViewCounts) as [QuoteCategory, number][];

  if (entries.length === 0) return null;

  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const [category, count] = sorted[0];

  if (count === 0) return null;

  return { category, count };
}
