import {
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfWeek,
  format,
  getDay,
  getHours,
  isAfter,
  isSameDay,
  isToday as isTodayDateFns,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import type {
  AdvancedAnalytics,
  DailyDataPoint,
  ExportData,
  Goal,
  GoalCompletionRate,
  ImportValidationError,
  InsightsData,
  MonthlyTrend,
  PomodoroHeatmapData,
  PomodoroSession,
  Quote,
  QuoteCategory,
  WeeklyTrend,
} from './types';
import { EXPORT_FORMAT_VERSION } from './types';

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
 * Get tomorrow's date in YYYY-MM-DD format
 */
export function getNextDayDateString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return format(tomorrow, 'yyyy-MM-dd');
}

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
export function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return format(yesterday, 'yyyy-MM-dd');
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

  if (dateString === today) return 'Today';
  if (dateString === yesterday) return 'Yesterday';
  if (dateString === tomorrow) return 'Tomorrow';

  return formatDate(dateString);
}

/**
 * Group goals by date and optionally sort
 * @param goals - Array of goals to group
 * @param sortOrder - 'desc' for newest first (default), 'asc' for oldest first
 * @returns Array of { date, goals[] } objects
 */
export function groupGoalsByDate(
  goals: Goal[],
  sortOrder: 'asc' | 'desc' = 'desc'
): Array<{ date: string; goals: Goal[] }> {
  // Group goals by date
  const groupedMap = goals.reduce(
    (acc, goal) => {
      if (!acc[goal.date]) {
        acc[goal.date] = [];
      }
      acc[goal.date].push(goal);
      return acc;
    },
    {} as Record<string, Goal[]>
  );

  // Convert to array and sort by date
  const groupedArray = Object.entries(groupedMap).map(([date, goals]) => ({
    date,
    goals,
  }));

  groupedArray.sort((a, b) => {
    const dateA = parseISO(a.date);
    const dateB = parseISO(b.date);
    return sortOrder === 'desc'
      ? dateB.getTime() - dateA.getTime() // Newest first
      : dateA.getTime() - dateB.getTime(); // Oldest first
  });

  return groupedArray;
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
 * Optionally filters by enabled categories, custom quotes, and favorites
 */
export function getRandomQuote(
  quotes: Quote[],
  currentQuoteId?: string,
  enabledCategories?: QuoteCategory[],
  showCustom = true,
  showFavoritesOnly = false
): Quote | null {
  let visibleQuotes = quotes.filter((q) => !q.isHidden);

  // Filter by favorites if enabled
  if (showFavoritesOnly) {
    visibleQuotes = visibleQuotes.filter((q) => q.isFavorite);
  }

  // Filter by enabled categories if provided
  // An empty array means no categories are enabled, so return null
  if (enabledCategories !== undefined) {
    if (enabledCategories.length === 0 && !showCustom) {
      return null;
    }
    visibleQuotes = visibleQuotes.filter((q) => {
      // Custom quotes pass if showCustom is enabled
      if (q.isCustom && showCustom) {
        return true;
      }
      // Non-custom quotes pass if their category is enabled
      if (!q.isCustom && enabledCategories.includes(q.category)) {
        return true;
      }
      return false;
    });
  } else if (!showCustom) {
    // If no category filter but showCustom is false, exclude custom quotes
    visibleQuotes = visibleQuotes.filter((q) => !q.isCustom);
  }

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

  // Calculate focus time stats
  const focusTimeToday = calculateFocusTimeToday(pomodoroSessions);
  const focusTimeThisWeek = calculateFocusTimeThisWeek(pomodoroSessions);

  return {
    totalQuotesViewed,
    quotesViewedThisWeek,
    goalsCompletedToday,
    goalsCompletedThisWeek,
    goalsCompletedThisMonth,
    pomodorosCompletedToday,
    focusTimeToday,
    focusTimeThisWeek,
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

/**
 * Calculate total focus time in minutes for completed work sessions
 */
export function calculateFocusTime(
  sessions: PomodoroSession[],
  filterFn?: (session: PomodoroSession) => boolean
): number {
  return sessions
    .filter((session) => {
      if (session.interrupted || session.type !== 'work') return false;
      return filterFn ? filterFn(session) : true;
    })
    .reduce((total, session) => total + session.duration, 0);
}

/**
 * Calculate focus time for today (in minutes)
 */
export function calculateFocusTimeToday(sessions: PomodoroSession[]): number {
  const today = startOfDay(new Date());
  return calculateFocusTime(sessions, (session) => {
    const sessionDate = parseISO(session.completedAt || session.startedAt);
    return isSameDay(sessionDate, today);
  });
}

/**
 * Calculate focus time for this week (in minutes)
 */
export function calculateFocusTimeThisWeek(sessions: PomodoroSession[]): number {
  const weekStart = startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 }); // Monday
  return calculateFocusTime(sessions, (session) => {
    const sessionDate = parseISO(session.completedAt || session.startedAt);
    return isAfter(sessionDate, weekStart) || isSameDay(sessionDate, weekStart);
  });
}

/**
 * Format focus time in minutes to hours and minutes
 */
export function formatFocusTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Calculate daily trends for the last N days
 */
export function calculateDailyTrends(
  goals: Goal[],
  pomodoroSessions: PomodoroSession[],
  days = 30
): DailyDataPoint[] {
  const now = new Date();
  const startDate = startOfDay(subDays(now, days - 1));
  const endDate = startOfDay(now);

  const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

  return dateRange.map((date) => {
    const dateStr = format(date, 'yyyy-MM-dd');

    // Goals completed on this day
    const goalsCompleted = goals.filter((goal) => {
      if (!goal.completed) return false;
      return goal.date === dateStr;
    }).length;

    // Pomodoros completed on this day
    const dayPomodoros = pomodoroSessions.filter((session) => {
      if (session.interrupted || session.type !== 'work') return false;
      const sessionDate = parseISO(session.completedAt || session.startedAt);
      return isSameDay(sessionDate, date);
    });

    const pomodorosCompleted = dayPomodoros.length;
    const focusTime = dayPomodoros.reduce((sum, session) => sum + session.duration, 0);

    return {
      date: dateStr,
      goalsCompleted,
      focusTime,
      pomodorosCompleted,
    };
  });
}

/**
 * Calculate weekly trends for the last N weeks
 */
export function calculateWeeklyTrends(
  goals: Goal[],
  pomodoroSessions: PomodoroSession[],
  weeks = 12
): WeeklyTrend[] {
  const now = new Date();
  const startDate = startOfWeek(subWeeks(now, weeks - 1), { weekStartsOn: 1 }); // Monday
  const endDate = endOfWeek(now, { weekStartsOn: 1 });

  const weekRanges = eachWeekOfInterval({ start: startDate, end: endDate }, { weekStartsOn: 1 });

  return weekRanges.map((weekStart) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weekLabel = `${format(weekStart, 'MMM d')}-${format(weekEnd, 'd')}`;

    // Goals completed in this week
    const goalsCompleted = goals.filter((goal) => {
      if (!goal.completed) return false;
      const goalDate = parseISO(goal.date);
      return (
        (isAfter(goalDate, weekStart) || isSameDay(goalDate, weekStart)) &&
        (isSameDay(goalDate, weekEnd) || !isAfter(goalDate, weekEnd))
      );
    }).length;

    // Pomodoros completed in this week
    const weekPomodoros = pomodoroSessions.filter((session) => {
      if (session.interrupted || session.type !== 'work') return false;
      const sessionDate = parseISO(session.completedAt || session.startedAt);
      return (
        (isAfter(sessionDate, weekStart) || isSameDay(sessionDate, weekStart)) &&
        (isSameDay(sessionDate, weekEnd) || !isAfter(sessionDate, weekEnd))
      );
    });

    const pomodorosCompleted = weekPomodoros.length;
    const focusTime = weekPomodoros.reduce((sum, session) => sum + session.duration, 0);

    return {
      weekLabel,
      goalsCompleted,
      focusTime,
      pomodorosCompleted,
    };
  });
}

/**
 * Calculate monthly trends for the last N months
 */
export function calculateMonthlyTrends(
  goals: Goal[],
  pomodoroSessions: PomodoroSession[],
  months = 6
): MonthlyTrend[] {
  const now = new Date();
  const trends: MonthlyTrend[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = i === 0 ? now : startOfMonth(subMonths(now, i - 1));
    const monthLabel = format(monthDate, 'MMMM yyyy');

    // Goals completed in this month
    const goalsCompleted = goals.filter((goal) => {
      if (!goal.completed) return false;
      const goalDate = parseISO(goal.date);
      return (
        (isAfter(goalDate, monthStart) || isSameDay(goalDate, monthStart)) &&
        !isAfter(goalDate, monthEnd)
      );
    }).length;

    // Pomodoros completed in this month
    const monthPomodoros = pomodoroSessions.filter((session) => {
      if (session.interrupted || session.type !== 'work') return false;
      const sessionDate = parseISO(session.completedAt || session.startedAt);
      return (
        (isAfter(sessionDate, monthStart) || isSameDay(sessionDate, monthStart)) &&
        !isAfter(sessionDate, monthEnd)
      );
    });

    const pomodorosCompleted = monthPomodoros.length;
    const focusTime = monthPomodoros.reduce((sum, session) => sum + session.duration, 0);

    trends.push({
      month: monthLabel,
      goalsCompleted,
      focusTime,
      pomodorosCompleted,
    });
  }

  return trends;
}

/**
 * Calculate goal completion rate
 */
export function calculateGoalCompletionRate(goals: Goal[]): GoalCompletionRate {
  const now = new Date();
  const weekStart = startOfWeek(startOfDay(now), { weekStartsOn: 1 });
  const monthStart = startOfMonth(startOfDay(now));

  // Overall
  const totalGoals = goals.length;
  const completedGoals = goals.filter((g) => g.completed).length;
  const completionRate = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0;

  // This week
  const weekGoals = goals.filter((goal) => {
    const goalDate = parseISO(goal.date);
    return isAfter(goalDate, weekStart) || isSameDay(goalDate, weekStart);
  });
  const weekCompleted = weekGoals.filter((g) => g.completed).length;
  const weekRate = weekGoals.length > 0 ? (weekCompleted / weekGoals.length) * 100 : 0;

  // This month
  const monthGoals = goals.filter((goal) => {
    const goalDate = parseISO(goal.date);
    return isAfter(goalDate, monthStart) || isSameDay(goalDate, monthStart);
  });
  const monthCompleted = monthGoals.filter((g) => g.completed).length;
  const monthRate = monthGoals.length > 0 ? (monthCompleted / monthGoals.length) * 100 : 0;

  return {
    totalGoals,
    completedGoals,
    completionRate,
    thisWeek: {
      totalGoals: weekGoals.length,
      completedGoals: weekCompleted,
      completionRate: weekRate,
    },
    thisMonth: {
      totalGoals: monthGoals.length,
      completedGoals: monthCompleted,
      completionRate: monthRate,
    },
  };
}

/**
 * Calculate pomodoro heatmap data
 */
export function calculatePomodoroHeatmap(sessions: PomodoroSession[]): PomodoroHeatmapData {
  // Filter to completed work sessions only
  const workSessions = sessions.filter(
    (session) => !session.interrupted && session.type === 'work'
  );

  // Initialize distributions
  const hourlyDistribution: Record<number, number> = {};
  const dailyDistribution: Record<string, number> = {};
  const weekdayDistribution: Record<number, number> = {};

  // Initialize all hours (0-23)
  for (let i = 0; i < 24; i++) {
    hourlyDistribution[i] = 0;
  }

  // Initialize all weekdays (0-6)
  for (let i = 0; i < 7; i++) {
    weekdayDistribution[i] = 0;
  }

  // Process each session
  workSessions.forEach((session) => {
    const sessionDate = parseISO(session.completedAt || session.startedAt);
    const hour = getHours(sessionDate);
    const weekday = getDay(sessionDate);
    const dateStr = format(sessionDate, 'yyyy-MM-dd');

    // Increment distributions
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
    weekdayDistribution[weekday] = (weekdayDistribution[weekday] || 0) + 1;
    dailyDistribution[dateStr] = (dailyDistribution[dateStr] || 0) + 1;
  });

  // Find top 3 most productive hours
  const hourCounts = Object.entries(hourlyDistribution)
    .map(([hour, count]) => ({ hour: Number(hour), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const productiveHours = hourCounts.map((h) => h.hour);

  return {
    hourlyDistribution,
    dailyDistribution,
    weekdayDistribution,
    productiveHours,
  };
}

/**
 * Calculate complete advanced analytics
 */
export function calculateAdvancedAnalytics(
  goals: Goal[],
  pomodoroSessions: PomodoroSession[]
): AdvancedAnalytics {
  return {
    dailyTrends: calculateDailyTrends(goals, pomodoroSessions, 30),
    weeklyTrends: calculateWeeklyTrends(goals, pomodoroSessions, 12),
    monthlyTrends: calculateMonthlyTrends(goals, pomodoroSessions, 6),
    goalCompletionRate: calculateGoalCompletionRate(goals),
    pomodoroHeatmap: calculatePomodoroHeatmap(pomodoroSessions),
  };
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data: Array<Record<string, unknown>>, headers: string[]): string {
  const csvRows: string[] = [];

  // Add header row
  csvRows.push(headers.join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      // Escape quotes and wrap in quotes if contains comma
      const escaped = String(value ?? '').replace(/"/g, '""');
      return escaped.includes(',') ? `"${escaped}"` : escaped;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Export daily trends to CSV
 */
export function exportDailyTrendsCSV(trends: DailyDataPoint[]): string {
  return convertToCSV(trends as unknown as Array<Record<string, unknown>>, [
    'date',
    'goalsCompleted',
    'focusTime',
    'pomodorosCompleted',
  ]);
}

/**
 * Export weekly trends to CSV
 */
export function exportWeeklyTrendsCSV(trends: WeeklyTrend[]): string {
  return convertToCSV(trends as unknown as Array<Record<string, unknown>>, [
    'weekLabel',
    'goalsCompleted',
    'focusTime',
    'pomodorosCompleted',
  ]);
}

/**
 * Export monthly trends to CSV
 */
export function exportMonthlyTrendsCSV(trends: MonthlyTrend[]): string {
  return convertToCSV(trends as unknown as Array<Record<string, unknown>>, [
    'month',
    'goalsCompleted',
    'focusTime',
    'pomodorosCompleted',
  ]);
}

/**
 * Export goals to CSV
 */
export function exportGoalsCSV(goals: Goal[]): string {
  const goalsData = goals.map((goal) => ({
    id: goal.id,
    text: goal.text,
    completed: goal.completed,
    createdAt: goal.createdAt,
    date: goal.date,
  }));
  return convertToCSV(goalsData, ['id', 'text', 'completed', 'createdAt', 'date']);
}

/**
 * Export pomodoro sessions to CSV
 */
export function exportPomodoroSessionsCSV(sessions: PomodoroSession[]): string {
  const sessionsData = sessions.map((session) => ({
    id: session.id,
    startedAt: session.startedAt,
    completedAt: session.completedAt || '',
    interrupted: session.interrupted,
    duration: session.duration,
    type: session.type,
    goalId: session.goalId || '',
  }));
  return convertToCSV(sessionsData, [
    'id',
    'startedAt',
    'completedAt',
    'interrupted',
    'duration',
    'type',
    'goalId',
  ]);
}

/**
 * Download a file in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Import utilities
// ============================================================================

/**
 * Validation result for import data
 */
export interface ImportValidation {
  isValid: boolean;
  errors: ImportValidationError[];
  warnings: string[];
  data: ExportData | null;
}

/**
 * Parse and validate import data from JSON string.
 * Performs JSON parsing, schema validation, and format version compatibility checks.
 *
 * @param jsonString - Raw JSON string from imported file
 * @returns ImportValidation containing validation status, errors, warnings, and parsed data
 *
 * @remarks
 * - Legacy exports without formatVersion are allowed with a warning
 * - Missing arrays (goals, quotes, pomodoroSessions) are initialized to empty with warnings
 * - Individual items in arrays are validated and invalid items are reported as errors
 * - Validation fails if formatVersion exceeds EXPORT_FORMAT_VERSION (forward compatibility)
 */
export function parseImportData(jsonString: string): ImportValidation {
  const errors: ImportValidationError[] = [];
  const warnings: string[] = [];

  // Try to parse JSON
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return {
      isValid: false,
      errors: [{ field: 'json', message: 'Invalid JSON format' }],
      warnings: [],
      data: null,
    };
  }

  // Check if it's an object
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      isValid: false,
      errors: [{ field: 'root', message: 'Export data must be an object' }],
      warnings: [],
      data: null,
    };
  }

  const exportData = data as Record<string, unknown>;

  // Check format version for compatibility
  if (exportData.formatVersion !== undefined) {
    const formatVersion = exportData.formatVersion as number;
    if (formatVersion > EXPORT_FORMAT_VERSION) {
      errors.push({
        field: 'formatVersion',
        message: `Export format version ${formatVersion} is newer than supported version ${EXPORT_FORMAT_VERSION}. Please update Cuewise to import this file.`,
      });
    }
  } else {
    // Legacy export without format version - add warning but allow import
    warnings.push(
      'This export file does not have a format version. It may be from an older version of Cuewise.'
    );
  }

  // Check for required arrays (can be empty but must exist)
  if (!Array.isArray(exportData.goals)) {
    exportData.goals = [];
    warnings.push('No goals found in export file');
  }

  if (!Array.isArray(exportData.quotes)) {
    exportData.quotes = [];
    warnings.push('No quotes found in export file');
  }

  if (!Array.isArray(exportData.pomodoroSessions)) {
    exportData.pomodoroSessions = [];
    warnings.push('No pomodoro sessions found in export file');
  }

  // Validate individual items
  const validatedData: ExportData = {
    version: (exportData.version as string) || 'unknown',
    formatVersion: (exportData.formatVersion as number) || 0,
    exportDate: (exportData.exportDate as string) || new Date().toISOString(),
    insights: (exportData.insights as ExportData['insights']) || null,
    analytics: (exportData.analytics as ExportData['analytics']) || null,
    goals: validateGoals(exportData.goals as unknown[], errors),
    quotes: validateQuotes(exportData.quotes as unknown[], errors),
    pomodoroSessions: validatePomodoroSessions(exportData.pomodoroSessions as unknown[], errors),
  };

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    data: validatedData,
  };
}

/**
 * Validate goals array
 */
function validateGoals(goals: unknown[], errors: ImportValidationError[]): Goal[] {
  const validGoals: Goal[] = [];

  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i] as Record<string, unknown>;

    if (typeof goal !== 'object' || goal === null) {
      errors.push({ field: `goals[${i}]`, message: 'Invalid goal format' });
      continue;
    }

    // Check required fields
    if (typeof goal.id !== 'string' || !goal.id) {
      errors.push({ field: `goals[${i}].id`, message: 'Goal must have a valid id' });
      continue;
    }

    if (typeof goal.text !== 'string') {
      errors.push({ field: `goals[${i}].text`, message: 'Goal must have text' });
      continue;
    }

    validGoals.push({
      id: goal.id,
      text: goal.text,
      completed: Boolean(goal.completed),
      createdAt: (goal.createdAt as string) || new Date().toISOString(),
      date: (goal.date as string) || getTodayDateString(),
    });
  }

  return validGoals;
}

/**
 * Validate quotes array
 */
function validateQuotes(quotes: unknown[], errors: ImportValidationError[]): Quote[] {
  const validQuotes: Quote[] = [];

  for (let i = 0; i < quotes.length; i++) {
    const quote = quotes[i] as Record<string, unknown>;

    if (typeof quote !== 'object' || quote === null) {
      errors.push({ field: `quotes[${i}]`, message: 'Invalid quote format' });
      continue;
    }

    // Check required fields
    if (typeof quote.id !== 'string' || !quote.id) {
      errors.push({ field: `quotes[${i}].id`, message: 'Quote must have a valid id' });
      continue;
    }

    if (typeof quote.text !== 'string' || !quote.text) {
      errors.push({ field: `quotes[${i}].text`, message: 'Quote must have text' });
      continue;
    }

    validQuotes.push({
      id: quote.id,
      text: quote.text,
      author: (quote.author as string) || 'Unknown',
      category: (quote.category as Quote['category']) || 'inspiration',
      isCustom: true, // All imported quotes are marked as custom
      isFavorite: Boolean(quote.isFavorite),
      isHidden: Boolean(quote.isHidden),
      viewCount: (quote.viewCount as number) || 0,
      lastViewed: quote.lastViewed as string | undefined,
      source: quote.source as string | undefined,
      notes: quote.notes as string | undefined,
    });
  }

  return validQuotes;
}

/**
 * Validate pomodoro sessions array
 */
function validatePomodoroSessions(
  sessions: unknown[],
  errors: ImportValidationError[]
): PomodoroSession[] {
  const validSessions: PomodoroSession[] = [];

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i] as Record<string, unknown>;

    if (typeof session !== 'object' || session === null) {
      errors.push({ field: `pomodoroSessions[${i}]`, message: 'Invalid session format' });
      continue;
    }

    // Check required fields
    if (typeof session.id !== 'string' || !session.id) {
      errors.push({ field: `pomodoroSessions[${i}].id`, message: 'Session must have a valid id' });
      continue;
    }

    if (typeof session.startedAt !== 'string') {
      errors.push({
        field: `pomodoroSessions[${i}].startedAt`,
        message: 'Session must have startedAt',
      });
      continue;
    }

    validSessions.push({
      id: session.id,
      startedAt: session.startedAt,
      completedAt: (session.completedAt as string) || undefined,
      interrupted: Boolean(session.interrupted),
      duration: (session.duration as number) || 25,
      type: (session.type as PomodoroSession['type']) || 'work',
      goalId: (session.goalId as string) || undefined,
    });
  }

  return validSessions;
}

/**
 * Compare semantic versions (e.g., "1.2.0" vs "1.3.0")
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 < p2) {
      return -1;
    }
    if (p1 > p2) {
      return 1;
    }
  }

  return 0;
}
