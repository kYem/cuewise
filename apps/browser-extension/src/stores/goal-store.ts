import {
  addSubtaskToGoal,
  duplicateGoal as duplicateGoalUtil,
  type Goal,
  type GoalProgress,
  generateId,
  getActiveGoals,
  getGoalProgress,
  getLinkedTasks,
  getNextDayDateString,
  getObjectives,
  getTodayDateString,
  groupGoalsByDate,
  isObjective,
  isTask,
  logger,
  removeSubtaskFromGoal,
  reorderGoals as reorderGoalsUtil,
  toggleSubtaskInGoal,
} from '@cuewise/shared';
import { getGoals as loadAllGoals, setGoals as saveAllGoals } from '@cuewise/storage';
import { create } from 'zustand';
import { useCelebrationStore } from './celebration-store';
import { useToastStore } from './toast-store';

export type CompletionFilter = 'all' | 'completed' | 'incomplete';

interface GoalStore {
  goals: Goal[];
  todayTasks: Goal[];
  isLoading: boolean;
  error: string | null;
  showAllTasks: boolean;
  completionFilter: CompletionFilter;

  // Task Actions (daily tasks) - return false on error, true on success
  initialize: () => Promise<void>;
  addTask: (text: string, parentId?: string) => Promise<boolean>;
  updateTask: (goalId: string, text: string) => Promise<boolean>;
  toggleTask: (goalId: string) => Promise<boolean>;
  deleteTask: (goalId: string) => Promise<boolean>;
  clearCompleted: () => Promise<boolean>;
  transferTaskToNextDay: (goalId: string) => Promise<boolean>;
  moveTaskToToday: (goalId: string) => Promise<boolean>;
  toggleShowAllTasks: () => void;
  setCompletionFilter: (filter: CompletionFilter) => void;
  getFilteredTasksByDate: () => Array<{ date: string; goals: Goal[] }>;

  // Task Enhancement Actions
  duplicateTask: (goalId: string) => Promise<boolean>;
  setTaskDueDate: (goalId: string, dueDate: string | null) => Promise<boolean>;
  addSubtask: (goalId: string, text: string) => Promise<boolean>;
  toggleSubtask: (goalId: string, subtaskId: string) => Promise<boolean>;
  removeSubtask: (goalId: string, subtaskId: string) => Promise<boolean>;
  reorderTasks: (fromIndex: number, toIndex: number) => Promise<boolean>;

  // Goal Actions (long-term goals) - return false on error, true on success
  addGoal: (title: string, dueDate: string, description?: string) => Promise<boolean>;
  updateGoal: (
    goalId: string,
    updates: { text?: string; description?: string; date?: string; completed?: boolean }
  ) => Promise<boolean>;
  deleteGoal: (goalId: string) => Promise<boolean>;
  linkTaskToGoal: (taskId: string, goalId: string | null) => Promise<boolean>;

  // Goal Selectors
  getGoals: () => Goal[];
  getActiveGoals: () => Goal[];
  getGoalProgress: (goalId: string) => GoalProgress | null;
  getLinkedTasks: (goalId: string) => Goal[];
}

function filterTodayTasks(goals: Goal[]): Goal[] {
  const today = getTodayDateString();
  return goals
    .filter((goal) => goal.date === today && isTask(goal))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export const useGoalStore = create<GoalStore>((set, get) => ({
  goals: [],
  todayTasks: [],
  isLoading: true,
  error: null,
  showAllTasks: false,
  completionFilter: 'all',

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      const allGoals = await loadAllGoals();

      set({ goals: allGoals, todayTasks: filterTodayTasks(allGoals), isLoading: false });
    } catch (error) {
      logger.error('Error initializing goal store', error);
      const errorMessage = 'Failed to load goals. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  addTask: async (text: string, parentId?: string) => {
    if (!text.trim()) {
      return false;
    }

    try {
      const today = getTodayDateString();
      const newGoal: Goal = {
        id: generateId(),
        text: text.trim(),
        completed: false,
        createdAt: new Date().toISOString(),
        date: today,
        parentId, // Link to objective if provided
      };

      const { goals } = get();
      const updatedGoals = [...goals, newGoal];

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });
      return true;
    } catch (error) {
      logger.error('Error adding goal', error);
      const errorMessage = 'Failed to add goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  updateTask: async (goalId: string, text: string) => {
    if (!text.trim()) {
      return false;
    }

    try {
      const { goals } = get();

      const updatedGoals = goals.map((goal) =>
        goal.id === goalId ? { ...goal, text: text.trim() } : goal
      );

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });
      return true;
    } catch (error) {
      logger.error('Error updating goal', error);
      const errorMessage = 'Failed to update goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  toggleTask: async (goalId: string) => {
    try {
      const { goals } = get();

      const updatedGoals = goals.map((goal) =>
        goal.id === goalId ? { ...goal, completed: !goal.completed } : goal
      );

      await saveAllGoals(updatedGoals);

      const updatedTodayTasks = filterTodayTasks(updatedGoals);
      set({ goals: updatedGoals, todayTasks: updatedTodayTasks });

      // Celebrate only when the user just completed the last remaining task today.
      const today = getTodayDateString();
      const toggledGoal = updatedGoals.find((goal) => goal.id === goalId);
      const justCompletedTodayTask =
        toggledGoal !== undefined &&
        isTask(toggledGoal) &&
        toggledGoal.date === today &&
        toggledGoal.completed === true;
      const allTodayComplete =
        updatedTodayTasks.length > 0 && updatedTodayTasks.every((task) => task.completed);
      if (justCompletedTodayTask && allTodayComplete) {
        useCelebrationStore.getState().celebrate('allGoals');
      }

      return true;
    } catch (error) {
      logger.error('Error toggling goal', error);
      const errorMessage = 'Failed to update goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  deleteTask: async (goalId: string) => {
    try {
      const { goals } = get();

      const updatedGoals = goals.filter((goal) => goal.id !== goalId);

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });
      return true;
    } catch (error) {
      logger.error('Error deleting goal', error);
      const errorMessage = 'Failed to delete goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  clearCompleted: async () => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

      // Remove completed tasks from today only (don't remove objectives)
      const updatedGoals = goals.filter(
        (goal) => !(goal.date === today && goal.completed && isTask(goal))
      );

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });
      return true;
    } catch (error) {
      logger.error('Error clearing completed goals', error);
      const errorMessage = 'Failed to clear completed goals. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  transferTaskToNextDay: async (goalId: string) => {
    try {
      const { goals } = get();
      const tomorrow = getNextDayDateString();

      const updatedGoals = goals.map((goal) => {
        if (goal.id === goalId) {
          return {
            ...goal,
            date: tomorrow,
            transferCount: (goal.transferCount || 0) + 1,
          };
        }
        return goal;
      });

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });

      useToastStore.getState().success('Goal transferred to tomorrow');
      return true;
    } catch (error) {
      logger.error('Error transferring goal', error);
      const errorMessage = 'Failed to transfer goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  moveTaskToToday: async (goalId: string) => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

      const updatedGoals = goals.map((goal) => {
        if (goal.id === goalId) {
          return {
            ...goal,
            date: today,
            completed: false, // Reset completion status when moving to today
          };
        }
        return goal;
      });

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });

      useToastStore.getState().success('Goal moved to today');
      return true;
    } catch (error) {
      logger.error('Error moving goal to today', error);
      const errorMessage = 'Failed to move goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  toggleShowAllTasks: () => {
    set((state) => ({ showAllTasks: !state.showAllTasks }));
  },

  setCompletionFilter: (filter: CompletionFilter) => {
    set({ completionFilter: filter });
  },

  getFilteredTasksByDate: () => {
    const { goals, completionFilter } = get();

    // Filter to tasks only (exclude objectives from the date-grouped view)
    const tasks = goals.filter(isTask);

    // Apply completion filter
    const filteredGoals =
      completionFilter === 'all'
        ? tasks
        : tasks.filter((goal) =>
            completionFilter === 'completed' ? goal.completed : !goal.completed
          );

    // Group by date (newest first)
    return groupGoalsByDate(filteredGoals, 'desc');
  },

  // ============================================================================
  // Task Enhancement Actions
  // ============================================================================

  duplicateTask: async (goalId: string) => {
    try {
      const { goals } = get();
      const goal = goals.find((g) => g.id === goalId && isTask(g));

      if (!goal) {
        logger.warn('Attempted to duplicate a non-existent or non-task goal', { goalId });
        return false;
      }

      const copy = duplicateGoalUtil(goal);
      const updatedGoals = [...goals, copy];

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });
      useToastStore.getState().success('Task duplicated');
      return true;
    } catch (error) {
      logger.error('Error duplicating task', error);
      const errorMessage = 'Failed to duplicate task. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  setTaskDueDate: async (goalId: string, dueDate: string | null) => {
    try {
      const { goals } = get();

      if (!goals.some((g) => g.id === goalId)) {
        logger.warn('Attempted to set due date on non-existent goal', { goalId });
        return false;
      }

      const updatedGoals = goals.map((goal) => {
        if (goal.id === goalId) {
          if (dueDate === null) {
            const { dueDate: _, ...rest } = goal;
            return rest;
          }
          return { ...goal, dueDate };
        }
        return goal;
      });

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });
      return true;
    } catch (error) {
      logger.error('Error setting task due date', error);
      const errorMessage = 'Failed to set due date. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  addSubtask: async (goalId: string, text: string) => {
    if (!text.trim()) {
      return false;
    }

    try {
      const { goals } = get();

      if (!goals.some((g) => g.id === goalId)) {
        logger.warn('Attempted to add subtask to non-existent goal', { goalId });
        return false;
      }

      const updatedGoals = goals.map((goal) => {
        if (goal.id === goalId) {
          return addSubtaskToGoal(goal, text.trim());
        }
        return goal;
      });

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });
      return true;
    } catch (error) {
      logger.error('Error adding subtask', error);
      const errorMessage = 'Failed to add subtask. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  toggleSubtask: async (goalId: string, subtaskId: string) => {
    try {
      const { goals } = get();

      if (!goals.some((g) => g.id === goalId)) {
        logger.warn('Attempted to toggle subtask on non-existent goal', { goalId });
        return false;
      }

      const updatedGoals = goals.map((goal) => {
        if (goal.id === goalId) {
          return toggleSubtaskInGoal(goal, subtaskId);
        }
        return goal;
      });

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });
      return true;
    } catch (error) {
      logger.error('Error toggling subtask', error);
      const errorMessage = 'Failed to update subtask. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  removeSubtask: async (goalId: string, subtaskId: string) => {
    try {
      const { goals } = get();

      if (!goals.some((g) => g.id === goalId)) {
        logger.warn('Attempted to remove subtask from non-existent goal', { goalId });
        return false;
      }

      const updatedGoals = goals.map((goal) => {
        if (goal.id === goalId) {
          return removeSubtaskFromGoal(goal, subtaskId);
        }
        return goal;
      });

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });
      return true;
    } catch (error) {
      logger.error('Error removing subtask', error);
      const errorMessage = 'Failed to remove subtask. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  reorderTasks: async (fromIndex: number, toIndex: number) => {
    try {
      const { goals, todayTasks } = get();

      const reorderedTodayTasks = reorderGoalsUtil(todayTasks, fromIndex, toIndex);

      // Skip storage write if nothing changed
      if (reorderedTodayTasks === todayTasks) {
        return true;
      }

      // Update sortOrder in the full goals array
      const sortOrderMap = new Map(reorderedTodayTasks.map((t) => [t.id, t.sortOrder]));
      const updatedGoals = goals.map((goal) => {
        const newOrder = sortOrderMap.get(goal.id);
        if (newOrder !== undefined) {
          return { ...goal, sortOrder: newOrder };
        }
        return goal;
      });

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: reorderedTodayTasks });
      return true;
    } catch (error) {
      logger.error('Error reordering tasks', error);
      const errorMessage = 'Failed to reorder tasks. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  // ============================================================================
  // Goal Actions (long-term goals)
  // ============================================================================

  addGoal: async (title: string, dueDate: string, description?: string) => {
    if (!title.trim()) {
      return false;
    }

    try {
      const newGoal: Goal = {
        id: generateId(),
        text: title.trim(),
        type: 'objective',
        completed: false,
        createdAt: new Date().toISOString(),
        date: dueDate,
        description: description?.trim(),
      };

      const { goals } = get();
      const updatedGoals = [...goals, newGoal];

      await saveAllGoals(updatedGoals);
      set({ goals: updatedGoals });

      useToastStore.getState().success('Goal created');
      return true;
    } catch (error) {
      logger.error('Error adding goal', error);
      const errorMessage = 'Failed to create goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  updateGoal: async (
    goalId: string,
    updates: { text?: string; description?: string; date?: string; completed?: boolean }
  ) => {
    try {
      const { goals } = get();

      const updatedGoals = goals.map((goal) => {
        if (goal.id === goalId && isObjective(goal)) {
          return {
            ...goal,
            ...(updates.text !== undefined && { text: updates.text.trim() }),
            ...(updates.description !== undefined && { description: updates.description.trim() }),
            ...(updates.date !== undefined && { date: updates.date }),
            ...(updates.completed !== undefined && { completed: updates.completed }),
          };
        }
        return goal;
      });

      await saveAllGoals(updatedGoals);
      set({ goals: updatedGoals });

      if (updates.completed === true) {
        useToastStore.getState().success('Goal completed!');
      } else if (updates.completed === false) {
        useToastStore.getState().success('Goal reopened');
      } else {
        useToastStore.getState().success('Goal updated');
      }
      return true;
    } catch (error) {
      logger.error('Error updating goal', error);
      const errorMessage = 'Failed to update goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  deleteGoal: async (goalId: string) => {
    try {
      const { goals } = get();

      // Remove the goal and unlink any tasks that were linked to it
      const updatedGoals = goals
        .filter((goal) => goal.id !== goalId)
        .map((goal) => {
          if (goal.parentId === goalId) {
            // Orphan the task - remove the parentId link
            const { parentId, ...rest } = goal;
            return rest;
          }
          return goal;
        });

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });

      useToastStore.getState().success('Goal deleted');
      return true;
    } catch (error) {
      logger.error('Error deleting goal', error);
      const errorMessage = 'Failed to delete goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  linkTaskToGoal: async (taskId: string, goalId: string | null) => {
    try {
      const { goals } = get();

      const updatedGoals = goals.map((goal) => {
        if (goal.id === taskId && isTask(goal)) {
          if (goalId === null) {
            // Unlink the task - remove parentId
            const { parentId, ...rest } = goal;
            return rest;
          }
          return { ...goal, parentId: goalId };
        }
        return goal;
      });

      await saveAllGoals(updatedGoals);

      set({ goals: updatedGoals, todayTasks: filterTodayTasks(updatedGoals) });
      return true;
    } catch (error) {
      logger.error('Error linking task to goal', error);
      const errorMessage = 'Failed to link task. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  // ============================================================================
  // Goal Selectors
  // ============================================================================

  getGoals: () => {
    const { goals } = get();
    return getObjectives(goals);
  },

  getActiveGoals: () => {
    const { goals } = get();
    return getActiveGoals(goals);
  },

  getGoalProgress: (goalId: string) => {
    const { goals } = get();
    const goal = goals.find((g) => g.id === goalId && isObjective(g));

    if (!goal) {
      return null;
    }

    return getGoalProgress(goal, goals);
  },

  getLinkedTasks: (goalId: string) => {
    const { goals } = get();
    return getLinkedTasks(goals, goalId);
  },
}));
