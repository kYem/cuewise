import {
  type Goal,
  generateId,
  getActiveObjectives,
  getLinkedTasks,
  getNextDayDateString,
  getObjectiveProgress,
  getObjectives,
  getTodayDateString,
  groupGoalsByDate,
  isObjective,
  isTask,
  logger,
  type ObjectiveProgress,
} from '@cuewise/shared';
import { getGoals, setGoals } from '@cuewise/storage';
import { create } from 'zustand';
import { useToastStore } from './toast-store';

export type CompletionFilter = 'all' | 'completed' | 'incomplete';

interface GoalStore {
  goals: Goal[];
  todayGoals: Goal[];
  isLoading: boolean;
  error: string | null;
  showAllGoals: boolean;
  completionFilter: CompletionFilter;

  // Task Actions
  initialize: () => Promise<void>;
  addGoal: (text: string, parentId?: string) => Promise<void>;
  updateGoal: (goalId: string, text: string) => Promise<void>;
  toggleGoal: (goalId: string) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  transferGoalToNextDay: (goalId: string) => Promise<void>;
  moveGoalToToday: (goalId: string) => Promise<void>;
  toggleShowAllGoals: () => void;
  setCompletionFilter: (filter: CompletionFilter) => void;
  getFilteredGoalsByDate: () => Array<{ date: string; goals: Goal[] }>;

  // Objective Actions
  addObjective: (title: string, dueDate: string, description?: string) => Promise<void>;
  updateObjective: (
    objectiveId: string,
    updates: { text?: string; description?: string; date?: string; completed?: boolean }
  ) => Promise<void>;
  deleteObjective: (objectiveId: string) => Promise<void>;
  linkTaskToObjective: (taskId: string, objectiveId: string | null) => Promise<void>;

  // Objective Selectors
  getObjectives: () => Goal[];
  getActiveObjectives: () => Goal[];
  getObjectiveProgress: (objectiveId: string) => ObjectiveProgress | null;
  getLinkedTasks: (objectiveId: string) => Goal[];
}

export const useGoalStore = create<GoalStore>((set, get) => ({
  goals: [],
  todayGoals: [],
  isLoading: true,
  error: null,
  showAllGoals: false,
  completionFilter: 'all',

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      const allGoals = await getGoals();
      const today = getTodayDateString();

      // Filter tasks for today (exclude objectives)
      const todayGoals = allGoals.filter((goal) => goal.date === today && isTask(goal));

      set({ goals: allGoals, todayGoals, isLoading: false });
    } catch (error) {
      logger.error('Error initializing goal store', error);
      const errorMessage = 'Failed to load goals. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  addGoal: async (text: string, parentId?: string) => {
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

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      logger.error('Error adding goal', error);
      const errorMessage = 'Failed to add goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateGoal: async (goalId: string, text: string) => {
    if (!text.trim()) {
      return;
    }

    try {
      const { goals } = get();
      const today = getTodayDateString();

      const updatedGoals = goals.map((goal) =>
        goal.id === goalId ? { ...goal, text: text.trim() } : goal
      );

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      logger.error('Error updating goal', error);
      const errorMessage = 'Failed to update goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  toggleGoal: async (goalId: string) => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

      const updatedGoals = goals.map((goal) =>
        goal.id === goalId ? { ...goal, completed: !goal.completed } : goal
      );

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      logger.error('Error toggling goal', error);
      const errorMessage = 'Failed to update goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  deleteGoal: async (goalId: string) => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

      const updatedGoals = goals.filter((goal) => goal.id !== goalId);

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      logger.error('Error deleting goal', error);
      const errorMessage = 'Failed to delete goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
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

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      logger.error('Error clearing completed goals', error);
      const errorMessage = 'Failed to clear completed goals. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  transferGoalToNextDay: async (goalId: string) => {
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

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayGoals });

      useToastStore.getState().success('Goal transferred to tomorrow');
    } catch (error) {
      logger.error('Error transferring goal', error);
      const errorMessage = 'Failed to transfer goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  moveGoalToToday: async (goalId: string) => {
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

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayGoals });

      useToastStore.getState().success('Goal moved to today');
    } catch (error) {
      logger.error('Error moving goal to today', error);
      const errorMessage = 'Failed to move goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  toggleShowAllGoals: () => {
    set((state) => ({ showAllGoals: !state.showAllGoals }));
  },

  setCompletionFilter: (filter: CompletionFilter) => {
    set({ completionFilter: filter });
  },

  getFilteredGoalsByDate: () => {
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
  // Objective Actions
  // ============================================================================

  addObjective: async (title: string, dueDate: string, description?: string) => {
    if (!title.trim()) {
      return;
    }

    try {
      const newObjective: Goal = {
        id: generateId(),
        text: title.trim(),
        type: 'objective',
        completed: false,
        createdAt: new Date().toISOString(),
        date: dueDate,
        description: description?.trim(),
      };

      const { goals } = get();
      const updatedGoals = [...goals, newObjective];

      await setGoals(updatedGoals);
      set({ goals: updatedGoals });

      useToastStore.getState().success('Goal created');
    } catch (error) {
      logger.error('Error adding goal', error);
      const errorMessage = 'Failed to create goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateObjective: async (
    objectiveId: string,
    updates: { text?: string; description?: string; date?: string; completed?: boolean }
  ) => {
    try {
      const { goals } = get();

      const updatedGoals = goals.map((goal) => {
        if (goal.id === objectiveId && isObjective(goal)) {
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

      await setGoals(updatedGoals);
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
    }
  },

  deleteObjective: async (objectiveId: string) => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

      // Remove the goal and unlink any tasks that were linked to it
      const updatedGoals = goals
        .filter((goal) => goal.id !== objectiveId)
        .map((goal) => {
          if (goal.parentId === objectiveId) {
            // Orphan the task - remove the parentId link
            const { parentId, ...rest } = goal;
            return rest;
          }
          return goal;
        });

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayGoals });

      useToastStore.getState().success('Goal deleted');
    } catch (error) {
      logger.error('Error deleting goal', error);
      const errorMessage = 'Failed to delete goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  linkTaskToObjective: async (taskId: string, objectiveId: string | null) => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

      const updatedGoals = goals.map((goal) => {
        if (goal.id === taskId && isTask(goal)) {
          if (objectiveId === null) {
            // Unlink the task - remove parentId
            const { parentId, ...rest } = goal;
            return rest;
          }
          return { ...goal, parentId: objectiveId };
        }
        return goal;
      });

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today && isTask(goal));
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      logger.error('Error linking task to objective', error);
      const errorMessage = 'Failed to link task. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  // ============================================================================
  // Objective Selectors
  // ============================================================================

  getObjectives: () => {
    const { goals } = get();
    return getObjectives(goals);
  },

  getActiveObjectives: () => {
    const { goals } = get();
    return getActiveObjectives(goals);
  },

  getObjectiveProgress: (objectiveId: string) => {
    const { goals } = get();
    const objective = goals.find((g) => g.id === objectiveId && isObjective(g));

    if (!objective) {
      return null;
    }

    return getObjectiveProgress(objective, goals);
  },

  getLinkedTasks: (objectiveId: string) => {
    const { goals } = get();
    return getLinkedTasks(goals, objectiveId);
  },
}));
