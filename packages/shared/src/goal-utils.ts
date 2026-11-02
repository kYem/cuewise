import { format, parseISO, startOfDay } from 'date-fns';
import { DAY_IN_MS } from './constants';
import { daysBetween, getNextDayDateString, getTodayDateString } from './date-utils';
import { generateId } from './ids';
import type { Goal, GoalProgress, GoalType, Subtask } from './types';

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
 * Incomplete tasks from the recent past — the carry-over backlog. Strictly before today: a task
 * transferred to tomorrow is a deferral, not a leftover.
 * @param goals - Array of all goals
 * @param daysBack - How many days back to include (default: 14)
 */
export function getRecentIncompleteTasks(goals: Goal[], daysBack = 14): Goal[] {
  const today = getTodayDateString();
  const cutoff = format(new Date(Date.now() - daysBack * DAY_IN_MS), 'yyyy-MM-dd');

  return goals.filter((g) => isTask(g) && !g.completed && g.date < today && g.date >= cutoff);
}

/** rolledIds: the tasks whose date moved — never empty; always a subset of goals. */
export interface RolledDueTasks {
  goals: Goal[];
  rolledIds: string[];
}

// Roll stale incomplete tasks whose deadline arrived (dueDate ≤ today) into today;
// null when nothing rolls. Tasks scheduled ahead (date > today) are a user choice — left alone.
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
