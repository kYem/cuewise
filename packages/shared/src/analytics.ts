import {
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfWeek,
  format,
  getDay,
  getHours,
  isAfter,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import { getTodayDateString } from './date-utils';
import { calculateAvgGoalProgress, getActiveGoals, isObjective } from './goal-utils';
import type {
  AdvancedAnalytics,
  DailyDataPoint,
  DayPart,
  FocusPeak,
  Goal,
  GoalCompletionRate,
  InsightsData,
  MonthlyTrend,
  PomodoroHeatmapData,
  PomodoroSession,
  Quote,
  QuoteCategory,
  WeeklyTrend,
} from './types';

/**
 * Calculate streak from sessions/goals
 * @param dates - Array of ISO date strings
 * @returns Object with current and longest streak counts
 */
export function calculateStreak(dates: string[]): { current: number; longest: number } {
  if (dates.length === 0) {
    return { current: 0, longest: 0 };
  }

  // Streak is anchored to today; drop future-dated entries (e.g. a completed
  // objective with a future due date) so they can't collapse the current streak.
  const today = startOfDay(new Date());
  const uniqueDates = [...new Set(dates)]
    .map((dateStr) => startOfDay(parseISO(dateStr)))
    .filter((date) => date.getTime() <= today.getTime())
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

function isOnOrAfter(date: Date, start: Date): boolean {
  return isAfter(date, start) || isSameDay(date, start);
}

function isOnOrBefore(date: Date, end: Date): boolean {
  return isSameDay(date, end) || !isAfter(date, end);
}

function countCompletedGoals(goals: Goal[], inRange: (date: Date) => boolean): number {
  return goals.filter((goal) => goal.completed && inRange(parseISO(goal.date))).length;
}

function isCompletedWorkSession(session: PomodoroSession): boolean {
  return !session.interrupted && session.type === 'work';
}

function sessionDateOf(session: PomodoroSession): Date {
  return parseISO(session.completedAt || session.startedAt);
}

function completedWorkSessions(
  sessions: PomodoroSession[],
  inRange: (date: Date) => boolean
): PomodoroSession[] {
  return sessions.filter(
    (session) => isCompletedWorkSession(session) && inRange(sessionDateOf(session))
  );
}

function totalDuration(sessions: PomodoroSession[]): number {
  return sessions.reduce((sum, session) => sum + session.duration, 0);
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
    if (quote.lastViewed && isOnOrAfter(parseISO(quote.lastViewed), weekStart)) {
      return sum + 1;
    }
    return sum;
  }, 0);

  const goalsCompletedToday = countCompletedGoals(goals, (date) => isSameDay(date, today));
  const goalsCompletedThisWeek = countCompletedGoals(goals, (date) => isOnOrAfter(date, weekStart));
  const goalsCompletedThisMonth = countCompletedGoals(goals, (date) =>
    isOnOrAfter(date, monthStart)
  );
  const pomodorosCompletedToday = countFocusSessionsToday(pomodoroSessions);

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

  // Calculate objective analytics
  const activeGoals = getActiveGoals(goals).length;
  const objectivesCompletedThisMonth = countCompletedGoals(goals.filter(isObjective), (date) =>
    isOnOrAfter(date, monthStart)
  );
  const avgGoalProgress = calculateAvgGoalProgress(goals);

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
    activeGoals,
    objectivesCompletedThisMonth,
    avgGoalProgress,
  };
}

/**
 * Get category with most views
 */
export function getMostViewedCategory(
  categoryViewCounts: Record<QuoteCategory, number>
): { category: QuoteCategory; count: number } | null {
  const entries = Object.entries(categoryViewCounts) as [QuoteCategory, number][];

  if (entries.length === 0) {
    return null;
  }

  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const [category, count] = sorted[0];

  if (count === 0) {
    return null;
  }

  return { category, count };
}

/**
 * Calculate total focus time in minutes for completed work sessions
 */
export function calculateFocusTime(
  sessions: PomodoroSession[],
  filterFn?: (session: PomodoroSession) => boolean
): number {
  return totalDuration(
    sessions.filter(
      (session) => isCompletedWorkSession(session) && (filterFn ? filterFn(session) : true)
    )
  );
}

/**
 * Calculate focus time for today (in minutes)
 */
export function calculateFocusTimeToday(sessions: PomodoroSession[]): number {
  const today = startOfDay(new Date());
  return totalDuration(completedWorkSessions(sessions, (date) => isSameDay(date, today)));
}

/**
 * Count completed focus (work) sessions for today.
 */
export function countFocusSessionsToday(sessions: PomodoroSession[]): number {
  const today = startOfDay(new Date());
  return completedWorkSessions(sessions, (date) => isSameDay(date, today)).length;
}

/**
 * Calculate focus time for this week (in minutes)
 */
export function calculateFocusTimeThisWeek(sessions: PomodoroSession[]): number {
  const weekStart = startOfWeek(startOfDay(new Date()), { weekStartsOn: 1 }); // Monday
  return totalDuration(completedWorkSessions(sessions, (date) => isOnOrAfter(date, weekStart)));
}

/**
 * Format focus time in minutes to hours and minutes
 */
export function formatFocusTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
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

    const goalsCompleted = goals.filter((goal) => goal.completed && goal.date === dateStr).length;
    const dayPomodoros = completedWorkSessions(pomodoroSessions, (d) => isSameDay(d, date));

    return {
      date: dateStr,
      goalsCompleted,
      focusTime: totalDuration(dayPomodoros),
      pomodorosCompleted: dayPomodoros.length,
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

    const inWeek = (date: Date) => isOnOrAfter(date, weekStart) && isOnOrBefore(date, weekEnd);
    const weekPomodoros = completedWorkSessions(pomodoroSessions, inWeek);

    return {
      weekLabel,
      goalsCompleted: countCompletedGoals(goals, inWeek),
      focusTime: totalDuration(weekPomodoros),
      pomodorosCompleted: weekPomodoros.length,
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

    const inMonth = (date: Date) => isOnOrAfter(date, monthStart) && !isAfter(date, monthEnd);
    const monthPomodoros = completedWorkSessions(pomodoroSessions, inMonth);

    trends.push({
      month: monthLabel,
      goalsCompleted: countCompletedGoals(goals, inMonth),
      focusTime: totalDuration(monthPomodoros),
      pomodorosCompleted: monthPomodoros.length,
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
  const weekGoals = goals.filter((goal) => isOnOrAfter(parseISO(goal.date), weekStart));
  const weekCompleted = weekGoals.filter((g) => g.completed).length;
  const weekRate = weekGoals.length > 0 ? (weekCompleted / weekGoals.length) * 100 : 0;

  // This month
  const monthGoals = goals.filter((goal) => isOnOrAfter(parseISO(goal.date), monthStart));
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
  const workSessions = sessions.filter(isCompletedWorkSession);

  // Initialize distributions
  const hourlyDistribution: Record<number, number> = {};
  const dailyDistribution: Record<string, number> = {};
  const weekdayDistribution: Record<number, number> = {};
  const weekdayHourDistribution = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

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
    const sessionDate = sessionDateOf(session);
    const hour = getHours(sessionDate);
    const weekday = getDay(sessionDate);
    const dateStr = format(sessionDate, 'yyyy-MM-dd');

    // Increment distributions
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
    weekdayDistribution[weekday] = (weekdayDistribution[weekday] || 0) + 1;
    dailyDistribution[dateStr] = (dailyDistribution[dateStr] || 0) + 1;
    weekdayHourDistribution[weekday][hour] += 1;
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
    weekdayHourDistribution,
    productiveHours,
  };
}

/** Fewer focus sessions than this is too little to call a pattern. */
export const FOCUS_PEAK_MIN_SESSIONS = 10;

export const DAY_PARTS: DayPart[] = ['morning', 'afternoon', 'evening', 'night'];

export function dayPartOfHour(hour: number): DayPart {
  if (hour >= 5 && hour < 12) {
    return 'morning';
  }
  if (hour >= 12 && hour < 17) {
    return 'afternoon';
  }
  if (hour >= 17 && hour < 21) {
    return 'evening';
  }
  return 'night';
}

/** Monday-first, matching the week the rest of Insights counts. */
export const FOCUS_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Hours before morning belong to the night that began the evening before. */
const LAST_NIGHT_HOUR = 4;

/**
 * The weekday and part of day with the most sessions, or null below the minimum.
 * Ties go to the earlier weekday, then the earlier part of the day.
 */
export function findFocusPeak(weekdayHourDistribution: number[][]): FocusPeak | null {
  const total = weekdayHourDistribution.flat().reduce((sum, count) => sum + count, 0);
  if (total < FOCUS_PEAK_MIN_SESSIONS) {
    return null;
  }
  const counts = weekdayHourDistribution.map(() => ({
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  }));
  weekdayHourDistribution.forEach((hours, weekday) => {
    hours.forEach((sessions, hour) => {
      const night = (weekday + 6) % 7;
      const owner = hour <= LAST_NIGHT_HOUR ? night : weekday;
      counts[owner][dayPartOfHour(hour)] += sessions;
    });
  });
  let peak: FocusPeak | null = null;
  let peakCount = 0;
  for (const weekday of FOCUS_WEEKDAY_ORDER) {
    for (const dayPart of DAY_PARTS) {
      if (counts[weekday][dayPart] > peakCount) {
        peak = { weekday, dayPart };
        peakCount = counts[weekday][dayPart];
      }
    }
  }
  return peak;
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
