import {
  addDays,
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
import {
  DAY_IN_MS,
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  POMODORO_DURATION_BOUNDS,
  REMINDER_INTERVAL_MAX,
  REMINDER_INTERVAL_MIN,
  REMINDER_SNOOZE_MINUTES,
} from './constants';
import { logger } from './logger';
import type {
  AdvancedAnalytics,
  DailyDataPoint,
  ExportData,
  Goal,
  GoalCompletionRate,
  GoalProgress,
  GoalType,
  ImportValidationError,
  InsightsData,
  MonthlyTrend,
  PomodoroHeatmapData,
  PomodoroSession,
  QuickLink,
  Quote,
  QuoteCategory,
  Reminder,
  ReminderFrequency,
  Settings,
  Subtask,
  WeeklyTrend,
} from './types';
import { EXPORT_FORMAT_VERSION } from './types';

/**
 * Time-sortable `timestamp-suffix` id. Suffix uses getRandomValues (CSPRNG) —
 * unlike crypto.randomUUID(), it also works from insecure contexts.
 */
export function generateId(): string {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(9)), (byte) =>
    (byte % 36).toString(36)
  ).join('');
  return `${Date.now()}-${suffix}`;
}

/** Dedupe (dropping falsy values) and locale-sort a list of strings. */
export function uniqueSorted(values: (string | undefined | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Append a trimmed tag, deduped case-insensitively. Returns the same array on no-op. */
export function addTag(tags: string[], value: string): string[] {
  const next = value.trim().replace(/,$/, '');
  if (next.length === 0 || tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
    return tags;
  }
  return [...tags, next];
}

/**
 * Normalize a user-entered URL into an absolute http(s) URL. Prepends https://
 * when no protocol is given. Returns null for anything that isn't a valid
 * http/https URL with a dotted hostname (catch handles URL parse failure).
 */
export function normalizeQuickLinkUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (!url.hostname.includes('.')) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Derive a display title from a URL's hostname (drops a leading "www.").
 */
export function deriveQuickLinkTitle(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Single-character monogram for a quick link, used when no favicon is available.
 */
export function quickLinkMonogram(link: QuickLink): string {
  const source = link.title.trim() || deriveQuickLinkTitle(link.url);
  // Array.from splits by code point, so a leading emoji isn't cut into a lone surrogate.
  const [firstChar] = Array.from(source.trim());
  return firstChar ? firstChar.toUpperCase() : '?';
}

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

// ============================================================================
// Objective utilities
// ============================================================================

/**
 * Get the type of a goal, defaulting to 'task' for backward compatibility.
 * Existing goals without a type field are treated as tasks.
 */
export function getGoalType(goal: Goal): GoalType {
  return goal.type ?? 'task';
}

/**
 * Check if a goal is a task (including goals without explicit type)
 */
export function isTask(goal: Goal): boolean {
  return getGoalType(goal) === 'task';
}

/**
 * Check if a goal is an objective
 */
export function isObjective(goal: Goal): boolean {
  return getGoalType(goal) === 'objective';
}

/**
 * Get all objectives from a list of goals
 */
export function getObjectives(goals: Goal[]): Goal[] {
  return goals.filter(isObjective);
}

/**
 * Get active (not completed) objectives
 */
export function getActiveGoals(goals: Goal[]): Goal[] {
  return goals.filter((g) => isObjective(g) && !g.completed);
}

/**
 * Get tasks linked to a specific objective
 */
export function getLinkedTasks(goals: Goal[], objectiveId: string): Goal[] {
  return goals.filter((g) => isTask(g) && g.parentId === objectiveId);
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

/**
 * Calculate progress for an objective based on its linked tasks
 */
export function getGoalProgress(objective: Goal, allGoals: Goal[]): GoalProgress {
  const tasks = getLinkedTasks(allGoals, objective.id);
  const completed = tasks.filter((t) => t.completed).length;

  const today = getTodayDateString();
  const daysRemaining = objective.date ? daysBetween(today, objective.date) : null;

  return {
    total: tasks.length,
    completed,
    percent: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
    tasks,
    daysRemaining,
    isOverdue: daysRemaining !== null && daysRemaining < 0,
  };
}

/**
 * Calculate average progress across all active objectives
 */
export function calculateAvgGoalProgress(goals: Goal[]): number {
  const activeGoals = getActiveGoals(goals);

  if (activeGoals.length === 0) {
    return 0;
  }

  const totalProgress = activeGoals.reduce((sum, objective) => {
    const progress = getGoalProgress(objective, goals);
    return sum + progress.percent;
  }, 0);

  return Math.round(totalProgress / activeGoals.length);
}

// ============================================================================
// Subtask utilities
// ============================================================================

/**
 * Add a subtask to a goal. Returns a new Goal with the subtask appended.
 */
export function addSubtaskToGoal(goal: Goal, text: string): Goal {
  const subtask: Subtask = {
    id: generateId(),
    text,
    completed: false,
  };
  return {
    ...goal,
    subtasks: [...(goal.subtasks ?? []), subtask],
  };
}

/**
 * Toggle a subtask's completed status. Returns a new Goal with the updated subtask.
 */
export function toggleSubtaskInGoal(goal: Goal, subtaskId: string): Goal {
  const subtasks = (goal.subtasks ?? []).map((s) => {
    if (s.id === subtaskId) {
      return { ...s, completed: !s.completed };
    }
    return s;
  });
  // A task with subtasks is complete exactly when all of them are, so toggling a
  // subtask rolls the parent's completion up (complete on the last check, reopen
  // when one is unchecked). Direct task completion is still allowed separately.
  const completed = subtasks.length > 0 && subtasks.every((s) => s.completed);
  return { ...goal, subtasks, completed };
}

/**
 * Remove a subtask from a goal. Returns a new Goal without the subtask.
 */
export function removeSubtaskFromGoal(goal: Goal, subtaskId: string): Goal {
  const subtasks = goal.subtasks ?? [];
  return {
    ...goal,
    subtasks: subtasks.filter((s) => s.id !== subtaskId),
  };
}

/**
 * Get subtask progress for a goal.
 * Returns { completed, total } counts.
 */
export function getSubtaskProgress(goal: Goal): { completed: number; total: number } {
  const subtasks = goal.subtasks ?? [];
  return {
    completed: subtasks.filter((s) => s.completed).length,
    total: subtasks.length,
  };
}

// ============================================================================
// Task duplication and reordering
// ============================================================================

/**
 * Duplicate a goal with a new ID. Resets completed, transferCount, and generates a new createdAt.
 * Subtasks are deep-copied with new IDs and reset to incomplete.
 */
export function duplicateGoal(goal: Goal): Goal {
  return {
    ...goal,
    id: generateId(),
    completed: false,
    createdAt: new Date().toISOString(),
    transferCount: 0,
    subtasks: (goal.subtasks ?? []).map((s) => ({
      ...s,
      id: generateId(),
      completed: false,
    })),
  };
}

/**
 * Reorder goals by moving an item from one index to another.
 * Returns a new array with updated sortOrder values.
 */
export function reorderGoals(goals: Goal[], fromIndex: number, toIndex: number): Goal[] {
  if (fromIndex === toIndex) {
    return goals;
  }
  if (fromIndex < 0 || fromIndex >= goals.length || toIndex < 0 || toIndex >= goals.length) {
    return goals;
  }

  const result = [...goals];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);

  return result.map((goal, index) => ({
    ...goal,
    sortOrder: index,
  }));
}

// ============================================================================
// Due date utilities
// ============================================================================

/**
 * Get tasks with a dueDate in the future (upcoming tasks).
 * @param goals - Array of all goals
 * @param daysAhead - Number of days ahead to look (default: 14)
 */
export function getUpcomingTasks(goals: Goal[], daysAhead = 14): (Goal & { dueDate: string })[] {
  const today = getTodayDateString();
  const cutoff = format(new Date(Date.now() + daysAhead * DAY_IN_MS), 'yyyy-MM-dd');

  return goals.filter((g): g is Goal & { dueDate: string } => {
    if (!isTask(g) || !g.dueDate) {
      return false;
    }
    return g.dueDate > today && g.dueDate <= cutoff;
  });
}

/**
 * Get incomplete goals from the recent past (excluding today) — the carry-over
 * backlog surfaced in the goals widget. Uses local-time date strings throughout.
 * @param goals - Array of all goals
 * @param daysBack - How many days back to include (default: 14)
 */
export function getRecentIncompleteTasks(goals: Goal[], daysBack = 14): Goal[] {
  const today = getTodayDateString();
  const cutoff = format(new Date(Date.now() - daysBack * DAY_IN_MS), 'yyyy-MM-dd');

  return goals.filter((g) => isTask(g) && !g.completed && g.date !== today && g.date >= cutoff);
}

export interface RolledDueTasks {
  goals: Goal[];
  rolledIds: string[];
}

// Move stale incomplete tasks whose deadline arrived (dueDate ≤ today) into today;
// null when nothing rolls, so callers can skip the write. Tasks scheduled ahead
// (date > today, e.g. transferred to tomorrow) are a user decision — left alone.
export function rollDueTasksToToday(goals: Goal[], today: string): RolledDueTasks | null {
  const rolledIds: string[] = [];
  const updated = goals.map((goal) => {
    if (!isTask(goal) || goal.completed || goal.date >= today) {
      return goal;
    }
    if (goal.dueDate === undefined || goal.dueDate > today) {
      return goal;
    }
    rolledIds.push(goal.id);
    return { ...goal, date: today };
  });
  if (rolledIds.length === 0) {
    return null;
  }
  return { goals: updated, rolledIds };
}

export interface NudgeShowState {
  dismissed: boolean;
  count: number;
  lastShownAt: string | null;
}

const REVIEW_STREAK_THRESHOLD = 7;
const REVIEW_POMODORO_THRESHOLD = 10;
export const REVIEW_MAX_SHOWS = 2;
const REVIEW_RESHOW_DAYS = 7;

/**
 * Whether to surface the store-review prompt: a delight milestone reached (7-day
 * streak or 10 pomodoros), past onboarding, not dismissed, shown < 2 times, and
 * the second ask spaced a week after the first. Pure so the trigger is
 * unit-testable. `today` and `state.lastShownAt` are `yyyy-MM-dd` day strings.
 */
export function shouldShowReviewPrompt(params: {
  streakCurrent: number;
  completedPomodoros: number;
  hasSeenOnboarding: boolean;
  state: NudgeShowState;
  today: string;
}): boolean {
  const { streakCurrent, completedPomodoros, hasSeenOnboarding, state, today } = params;

  if (state.dismissed || !hasSeenOnboarding || state.count >= REVIEW_MAX_SHOWS) {
    return false;
  }

  const reachedMilestone =
    streakCurrent >= REVIEW_STREAK_THRESHOLD || completedPomodoros >= REVIEW_POMODORO_THRESHOLD;
  if (!reachedMilestone) {
    return false;
  }

  // The second ask waits at least a week after the first. daysBetween returns NaN
  // for a missing/malformed lastShownAt; the negated comparison keeps it hidden.
  if (state.count >= 1) {
    if (!state.lastShownAt) {
      return false;
    }
    if (!(daysBetween(state.lastShownAt, today) >= REVIEW_RESHOW_DAYS)) {
      return false;
    }
  }

  return true;
}

/**
 * Get a short human-readable label for a due date.
 * Returns "Today", "Tomorrow", day name for this week, or "Mon, Jan 15" for further dates.
 */
export function getDueDateLabel(dueDate: string): string {
  const today = getTodayDateString();
  const tomorrow = getNextDayDateString();

  if (dueDate === today) {
    return 'Today';
  }
  if (dueDate === tomorrow) {
    return 'Tomorrow';
  }

  const dueDateObj = parseISO(dueDate);
  const todayObj = new Date();
  const diffDays = Math.ceil(
    (dueDateObj.getTime() - startOfDay(todayObj).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Within this week (next 6 days), show day name
  if (diffDays > 0 && diffDays <= 6) {
    return format(dueDateObj, 'EEEE'); // "Monday", "Tuesday", etc.
  }

  // Past due
  if (diffDays < 0) {
    return format(dueDateObj, 'MMM d'); // "Jan 15"
  }

  // Further out - show abbreviated date
  return format(dueDateObj, 'EEE, MMM d'); // "Mon, Jan 15"
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
 * Optionally filters by enabled categories, custom quotes, favorites, and collections
 *
 * Filter logic uses OR - quote passes if it matches ANY enabled filter:
 * - Matches an enabled category, OR
 * - Is a custom quote (if showCustom enabled), OR
 * - Is a favorite (if showFavorites enabled), OR
 * - Is in an enabled collection (if collections are active)
 */
export function getRandomQuote(
  quotes: Quote[],
  currentQuoteId?: string,
  enabledCategories?: QuoteCategory[],
  showCustom = true,
  showFavorites = false,
  collectionIds?: string[]
): Quote | null {
  let visibleQuotes = quotes.filter((q) => !q.isHidden);

  // Check if any filters are enabled
  const hasCollectionFilter = collectionIds && collectionIds.length > 0;
  const hasCategoryFilter = enabledCategories !== undefined && enabledCategories.length > 0;
  const hasNoFiltersEnabled =
    !hasCategoryFilter && !showCustom && !showFavorites && !hasCollectionFilter;

  // If no filters are enabled at all, return null
  if (enabledCategories !== undefined && hasNoFiltersEnabled) {
    return null;
  }

  // Apply OR filter - quote passes if it matches ANY enabled criteria
  if (enabledCategories !== undefined || hasCollectionFilter) {
    visibleQuotes = visibleQuotes.filter((q) => {
      // Quote is in an enabled collection
      if (hasCollectionFilter && q.collectionIds?.some((id) => collectionIds.includes(id))) {
        return true;
      }
      // Favorite quotes pass if showFavorites is enabled
      if (q.isFavorite && showFavorites) {
        return true;
      }
      // Custom quotes pass if showCustom is enabled
      if (q.isCustom && showCustom) {
        return true;
      }
      // Non-custom quotes pass if their category is enabled
      if (!q.isCustom && enabledCategories && enabledCategories.includes(q.category)) {
        return true;
      }
      return false;
    });
  } else if (!showCustom && !showFavorites) {
    // If no filters active but showCustom and showFavorites are false, exclude custom quotes
    visibleQuotes = visibleQuotes.filter((q) => !q.isCustom);
  } else if (!showCustom) {
    // Exclude custom quotes but keep favorites if enabled
    visibleQuotes = visibleQuotes.filter((q) => !q.isCustom || (q.isFavorite && showFavorites));
  }

  if (visibleQuotes.length === 0) {
    return null;
  }

  // If only one visible quote, return it (no choice)
  if (visibleQuotes.length === 1) {
    return visibleQuotes[0];
  }

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
    if (!goal.completed) {
      return false;
    }
    const goalDate = parseISO(goal.date);
    return isSameDay(goalDate, today);
  }).length;

  // Goals completed this week
  const goalsCompletedThisWeek = goals.filter((goal) => {
    if (!goal.completed) {
      return false;
    }
    const goalDate = parseISO(goal.date);
    return isAfter(goalDate, weekStart) || isSameDay(goalDate, weekStart);
  }).length;

  // Goals completed this month
  const goalsCompletedThisMonth = goals.filter((goal) => {
    if (!goal.completed) {
      return false;
    }
    const goalDate = parseISO(goal.date);
    return isAfter(goalDate, monthStart) || isSameDay(goalDate, monthStart);
  }).length;

  // Pomodoros completed today
  const pomodorosCompletedToday = pomodoroSessions.filter((session) => {
    if (session.interrupted || session.type !== 'work') {
      return false;
    }
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

  // Calculate objective analytics
  const activeGoals = getActiveGoals(goals).length;
  const objectivesCompletedThisMonth = goals.filter((goal) => {
    if (!isObjective(goal) || !goal.completed) {
      return false;
    }
    const goalDate = parseISO(goal.date);
    return isAfter(goalDate, monthStart) || isSameDay(goalDate, monthStart);
  }).length;
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
  return sessions
    .filter((session) => {
      if (session.interrupted || session.type !== 'work') {
        return false;
      }
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
 * Count completed focus (work) sessions for today.
 */
export function countFocusSessionsToday(sessions: PomodoroSession[]): number {
  const today = startOfDay(new Date());
  return sessions.filter((session) => {
    if (session.interrupted || session.type !== 'work') {
      return false;
    }
    const sessionDate = parseISO(session.completedAt || session.startedAt);
    return isSameDay(sessionDate, today);
  }).length;
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

    // Goals completed on this day
    const goalsCompleted = goals.filter((goal) => {
      if (!goal.completed) {
        return false;
      }
      return goal.date === dateStr;
    }).length;

    // Pomodoros completed on this day
    const dayPomodoros = pomodoroSessions.filter((session) => {
      if (session.interrupted || session.type !== 'work') {
        return false;
      }
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
      if (!goal.completed) {
        return false;
      }
      const goalDate = parseISO(goal.date);
      return (
        (isAfter(goalDate, weekStart) || isSameDay(goalDate, weekStart)) &&
        (isSameDay(goalDate, weekEnd) || !isAfter(goalDate, weekEnd))
      );
    }).length;

    // Pomodoros completed in this week
    const weekPomodoros = pomodoroSessions.filter((session) => {
      if (session.interrupted || session.type !== 'work') {
        return false;
      }
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
      if (!goal.completed) {
        return false;
      }
      const goalDate = parseISO(goal.date);
      return (
        (isAfter(goalDate, monthStart) || isSameDay(goalDate, monthStart)) &&
        !isAfter(goalDate, monthEnd)
      );
    }).length;

    // Pomodoros completed in this month
    const monthPomodoros = pomodoroSessions.filter((session) => {
      if (session.interrupted || session.type !== 'work') {
        return false;
      }
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
      // Preserve optional fields when present
      ...(goal.type === 'task' || goal.type === 'objective' ? { type: goal.type } : {}),
      ...(typeof goal.parentId === 'string' ? { parentId: goal.parentId } : {}),
      ...(typeof goal.transferCount === 'number' ? { transferCount: goal.transferCount } : {}),
      ...(typeof goal.description === 'string' ? { description: goal.description } : {}),
      ...(typeof goal.dueDate === 'string' ? { dueDate: goal.dueDate } : {}),
      ...(typeof goal.sortOrder === 'number' ? { sortOrder: goal.sortOrder } : {}),
      ...(Array.isArray(goal.subtasks) ? { subtasks: goal.subtasks as Subtask[] } : {}),
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

/**
 * Clamp a user-supplied interval to a whole number of minutes within range.
 * NaN falls back to the default; ±Infinity clamps to the [min, max] bounds.
 */
export function clampIntervalMinutes(value: number): number {
  if (Number.isNaN(value)) {
    return DEFAULT_REMINDER_INTERVAL_MINUTES;
  }
  const floored = Math.floor(value);
  if (!(floored >= REMINDER_INTERVAL_MIN)) {
    return REMINDER_INTERVAL_MIN; // catches -Infinity and sub-min values
  }
  if (floored > REMINDER_INTERVAL_MAX) {
    return REMINDER_INTERVAL_MAX; // catches +Infinity and over-max values
  }
  return floored;
}

/**
 * Clamp any pomodoro rhythm fields present in a settings patch to their valid
 * bounds (POMODORO_DURATION_BOUNDS). Applied by updateSettings, so anything writing
 * durations through the settings store — presets, steppers, a future settings
 * import — can't persist an out-of-range value. The UI steppers also clamp on click;
 * this is the store-side backstop.
 */
export function clampPomodoroDurations(patch: Partial<Settings>): Partial<Settings> {
  const clamp = (value: number, min: number, max: number): number => {
    const rounded = Math.round(value);
    if (Number.isNaN(rounded)) {
      // NaN isn't out-of-range, it's a corruption signal (bad import / storage read);
      // heal it to the lower bound but leave a breadcrumb rather than silently reset.
      logger.warn('clampPomodoroDurations: coercing a NaN duration to its minimum', { min });
      return min;
    }
    return Math.min(max, Math.max(min, rounded));
  };
  const out: Partial<Settings> = { ...patch };
  const b = POMODORO_DURATION_BOUNDS;
  if (typeof out.pomodoroWorkDuration === 'number') {
    out.pomodoroWorkDuration = clamp(
      out.pomodoroWorkDuration,
      b.pomodoroWorkDuration.min,
      b.pomodoroWorkDuration.max
    );
  }
  if (typeof out.pomodoroBreakDuration === 'number') {
    out.pomodoroBreakDuration = clamp(
      out.pomodoroBreakDuration,
      b.pomodoroBreakDuration.min,
      b.pomodoroBreakDuration.max
    );
  }
  if (typeof out.pomodoroLongBreakDuration === 'number') {
    out.pomodoroLongBreakDuration = clamp(
      out.pomodoroLongBreakDuration,
      b.pomodoroLongBreakDuration.min,
      b.pomodoroLongBreakDuration.max
    );
  }
  if (typeof out.pomodoroLongBreakInterval === 'number') {
    out.pomodoroLongBreakInterval = clamp(
      out.pomodoroLongBreakInterval,
      b.pomodoroLongBreakInterval.min,
      b.pomodoroLongBreakInterval.max
    );
  }
  return out;
}

/** Ultra-compact interval label: "30m", "1h", "1h 30m". */
export function formatCompactInterval(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

/** A Date `minutes` from now — the fire-time anchor for interval cadences. */
export function intervalDueDateFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

/** Advance a Date by one calendar cadence in place (daily / weekly / monthly). */
function advanceCalendarDate(date: Date, frequency: ReminderFrequency | undefined): void {
  if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  } else {
    date.setDate(date.getDate() + 1); // daily / default
  }
}

// Namespaces a reminder's scheduler/notification id so the background worker can
// tell reminder alarms apart from any other scheduled wake.
const REMINDER_ALARM_PREFIX = 'reminder-';

/** The scheduler/notification id for a reminder's alarm. */
export function reminderAlarmId(reminderId: string): string {
  return `${REMINDER_ALARM_PREFIX}${reminderId}`;
}

/** The reminder id behind an alarm id, or null when it is not a reminder alarm. */
export function reminderIdFromAlarm(alarmId: string): string | null {
  if (!alarmId.startsWith(REMINDER_ALARM_PREFIX)) {
    return null;
  }
  return alarmId.slice(REMINDER_ALARM_PREFIX.length);
}

/**
 * Next due date strictly after `now` for a recurring reminder.
 * 'interval' anchors to fire-time (now + intervalMinutes); the calendar
 * frequencies advance from the stored dueDate until they land in the future.
 */
export function nextReminderDueDate(reminder: Reminder, now: Date): Date {
  const recurring = reminder.recurring;
  if (recurring?.frequency === 'interval') {
    const minutes = clampIntervalMinutes(recurring.intervalMinutes);
    return new Date(now.getTime() + minutes * 60_000);
  }

  const frequency = recurring?.frequency;
  const next = new Date(reminder.dueDate);
  while (next <= now) {
    advanceCalendarDate(next, frequency);
  }
  return next;
}

/**
 * Next due date when the user checks off an UPCOMING (not-yet-fired) recurring
 * occurrence early — skip it and move to the one after, anchored to the scheduled
 * dueDate (not `now`). Calendar cadences keep their clock time (tonight 9pm →
 * tomorrow 9pm); interval adds one cadence.
 */
export function skipReminderOccurrence(reminder: Reminder): Date {
  const recurring = reminder.recurring;
  const next = new Date(reminder.dueDate);
  if (recurring?.frequency === 'interval') {
    const minutes = clampIntervalMinutes(recurring.intervalMinutes);
    next.setTime(next.getTime() + minutes * 60_000);
    return next;
  }
  advanceCalendarDate(next, recurring?.frequency);
  return next;
}

/**
 * True when checking off this reminder would SKIP an upcoming occurrence
 * (recurring + not yet fired) rather than complete/restart it. Drives both the
 * store's skip-vs-restart branch and the check control's skip affordance, so the
 * icon can never disagree with the action.
 */
export function isUpcomingRecurringOccurrence(reminder: Reminder, now: Date): boolean {
  if (!reminder.recurring || reminder.completed) {
    return false;
  }
  return new Date(reminder.dueDate).getTime() > now.getTime();
}

/**
 * Build a reminder's `recurring` payload from form state.
 * Interval cadences carry `intervalMinutes`; calendar cadences are frequency-only;
 * a non-recurring reminder is `undefined`. Pass an already-clamped interval.
 */
export function buildReminderRecurring(
  isRecurring: boolean,
  frequency: ReminderFrequency,
  clampedIntervalMinutes: number
): Reminder['recurring'] {
  if (!isRecurring) {
    return undefined;
  }
  if (frequency === 'interval') {
    return { frequency, intervalMinutes: clampedIntervalMinutes };
  }
  return { frequency };
}

/**
 * Human-readable cadence label for a recurring reminder.
 * 'interval' renders as "every N min"; calendar frequencies pass through.
 */
export function formatReminderCadence(recurring: NonNullable<Reminder['recurring']>): string {
  if (recurring.frequency === 'interval') {
    return `every ${clampIntervalMinutes(recurring.intervalMinutes)} min`;
  }
  return recurring.frequency;
}

export type ReminderNotificationAction =
  | { type: 'complete' }
  | { type: 'snooze'; dueDate: string }
  | { type: 'dismiss' };

/**
 * Decide what a notification button does, free of chrome.* side effects so it's
 * unit-testable. buttonIndex 0 = Done, 1 = Snooze. `now` is the current time.
 */
export function resolveReminderNotificationAction(
  reminder: Reminder | undefined,
  buttonIndex: number,
  now: Date
): ReminderNotificationAction {
  if (!reminder) {
    return { type: 'dismiss' };
  }
  if (buttonIndex === 0) {
    // Done: complete one-offs. An active recurring reminder was already advanced
    // on fire, and a paused one must not be completed — just dismiss.
    if (!reminder.recurring) {
      return { type: 'complete' };
    }
    return { type: 'dismiss' };
  }
  if (buttonIndex === 1) {
    // Snooze: never resurrect a paused recurring reminder.
    if (reminder.recurring && reminder.paused) {
      return { type: 'dismiss' };
    }
    return {
      type: 'snooze',
      dueDate: new Date(now.getTime() + REMINDER_SNOOZE_MINUTES * 60_000).toISOString(),
    };
  }
  return { type: 'dismiss' };
}
