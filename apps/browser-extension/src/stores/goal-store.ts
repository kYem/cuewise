import {
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
} from '@cuewise/shared';
import { getGoals as loadAllGoals, setGoals as saveAllGoals } from '@cuewise/storage';
import { create } from 'zustand';
import { useToastStore } from './toast-store';

export type CompletionFilter = 'all' | 'completed' | 'incomplete';

interface GoalStore {
  goals: Goal[];
  todayTasks: Goal[];
  isLoading: boolean;
  error: string | null;
  showAllTasks: boolean;
  completionFilter: CompletionFilter;

  // Task Actions (daily tasks)
  initialize: () => Promise<void>;
  addTask: (text: string, parentId?: string) => Promise<void>;
  updateTask: (goalId: string, text: string) => Promise<void>;
  toggleTask: (goalId: string) => Promise<void>;
  deleteTask: (goalId: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  transferTaskToNextDay: (goalId: string) => Promise<void>;
  moveTaskToToday: (goalId: string) => Promise<void>;
  toggleShowAllTasks: () => void;
  setCompletionFilter: (filter: CompletionFilter) => void;
  getFilteredTasksByDate: () => Array<{ date: string; goals: Goal[] }>;

  // Goal Actions (long-term goals)
  addGoal: (title: string, dueDate: string, description?: string) => Promise<void>;
  updateGoal: (
    goalId: string,
    updates: { text?: string; description?: string; date?: string; completed?: boolean }
  ) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  linkTaskToGoal: (taskId: string, goalId: string | null) => Promise<void>;

  // Goal Selectors
  getGoals: () => Goal[];
  getActiveGoals: () => Goal[];
  getGoalProgress: (goalId: string) => GoalProgress | null;
  getLinkedTasks: (goalId: string) => Goal[];
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
      const today = getTodayDateString();

      // Filter tasks for today (exclude objectives)
      const todayTasks = allGoals.filter((goal) => goal.date === today && isTask(goal));

      set({ goals: allGoals, todayTasks, isLoading: false });
    } catch (error) {
      logger.error('Error initializing goal store', error);
      const errorMessage = 'Failed to load goals. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  addTask: async (text: string, parentId?: string) => {
    if (!text.trim()) {
      return;
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

      const todayTasks = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayTasks });
    } catch (error) {
      logger.error('Error adding goal', error);
      const errorMessage = 'Failed to add goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
    }
  },

  updateTask: async (goalId: string, text: string) => {
    if (!text.trim()) {
      return;
    }

    try {
      const { goals } = get();
      const today = getTodayDateString();

      const updatedGoals = goals.map((goal) =>
        goal.id === goalId ? { ...goal, text: text.trim() } : goal
      );

      await saveAllGoals(updatedGoals);

      const todayTasks = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayTasks });
    } catch (error) {
      logger.error('Error updating goal', error);
      const errorMessage = 'Failed to update goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
    }
  },

  toggleTask: async (goalId: string) => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

      const updatedGoals = goals.map((goal) =>
        goal.id === goalId ? { ...goal, completed: !goal.completed } : goal
      );

      await saveAllGoals(updatedGoals);

      const todayTasks = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayTasks });
    } catch (error) {
      logger.error('Error toggling goal', error);
      const errorMessage = 'Failed to update goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
    }
  },

  deleteTask: async (goalId: string) => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

      const updatedGoals = goals.filter((goal) => goal.id !== goalId);

      await saveAllGoals(updatedGoals);

      const todayTasks = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayTasks });
    } catch (error) {
      logger.error('Error deleting goal', error);
      const errorMessage = 'Failed to delete goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
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

      const todayTasks = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayTasks });
    } catch (error) {
      logger.error('Error clearing completed goals', error);
      const errorMessage = 'Failed to clear completed goals. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
    }
  },

  transferTaskToNextDay: async (goalId: string) => {
    try {
      const { goals } = get();
      const today = getTodayDateString();
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

      const todayTasks = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayTasks });

      useToastStore.getState().success('Goal transferred to tomorrow');
    } catch (error) {
      logger.error('Error transferring goal', error);
      const errorMessage = 'Failed to transfer goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
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

      const todayTasks = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayTasks });

      useToastStore.getState().success('Goal moved to today');
    } catch (error) {
      logger.error('Error moving goal to today', error);
      const errorMessage = 'Failed to move goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
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
  // Goal Actions (long-term goals)
  // ============================================================================

  addGoal: async (title: string, dueDate: string, description?: string) => {
    if (!title.trim()) {
      return;
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
    } catch (error) {
      logger.error('Error adding goal', error);
      const errorMessage = 'Failed to create goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
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
    } catch (error) {
      logger.error('Error updating goal', error);
      const errorMessage = 'Failed to update goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
    }
  },

  deleteGoal: async (goalId: string) => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

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

      const todayTasks = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayTasks });

      useToastStore.getState().success('Goal deleted');
    } catch (error) {
      logger.error('Error deleting goal', error);
      const errorMessage = 'Failed to delete goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
    }
  },

  linkTaskToGoal: async (taskId: string, goalId: string | null) => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

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

      const todayTasks = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayTasks });
    } catch (error) {
      logger.error('Error linking task to objective', error);
      const errorMessage = 'Failed to link task. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
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
