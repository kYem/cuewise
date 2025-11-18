import {
  type Goal,
  generateId,
  getNextDayDateString,
  getTodayDateString,
  groupGoalsByDate,
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

  // Actions
  initialize: () => Promise<void>;
  addGoal: (text: string) => Promise<void>;
  updateGoal: (goalId: string, text: string) => Promise<void>;
  toggleGoal: (goalId: string) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  transferGoalToNextDay: (goalId: string) => Promise<void>;
  moveGoalToToday: (goalId: string) => Promise<void>;
  toggleShowAllGoals: () => void;
  setCompletionFilter: (filter: CompletionFilter) => void;
  getFilteredGoalsByDate: () => Array<{ date: string; goals: Goal[] }>;
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

      // Filter goals for today
      const todayGoals = allGoals.filter((goal) => goal.date === today);

      set({ goals: allGoals, todayGoals, isLoading: false });
    } catch (error) {
      console.error('Error initializing goal store:', error);
      const errorMessage = 'Failed to load goals. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  addGoal: async (text: string) => {
    if (!text.trim()) return;

    try {
      const today = getTodayDateString();
      const newGoal: Goal = {
        id: generateId(),
        text: text.trim(),
        completed: false,
        createdAt: new Date().toISOString(),
        date: today,
      };

      const { goals } = get();
      const updatedGoals = [...goals, newGoal];

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today);
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      console.error('Error adding goal:', error);
      const errorMessage = 'Failed to add goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  updateGoal: async (goalId: string, text: string) => {
    if (!text.trim()) return;

    try {
      const { goals } = get();
      const today = getTodayDateString();

      const updatedGoals = goals.map((goal) =>
        goal.id === goalId ? { ...goal, text: text.trim() } : goal
      );

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today);
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      console.error('Error updating goal:', error);
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

      const todayGoals = updatedGoals.filter((goal) => goal.date === today);
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      console.error('Error toggling goal:', error);
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

      const todayGoals = updatedGoals.filter((goal) => goal.date === today);
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      console.error('Error deleting goal:', error);
      const errorMessage = 'Failed to delete goal. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  clearCompleted: async () => {
    try {
      const { goals } = get();
      const today = getTodayDateString();

      // Remove completed goals from today only
      const updatedGoals = goals.filter((goal) => !(goal.date === today && goal.completed));

      await setGoals(updatedGoals);

      const todayGoals = updatedGoals.filter((goal) => goal.date === today);
      set({ goals: updatedGoals, todayGoals });
    } catch (error) {
      console.error('Error clearing completed goals:', error);
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

      const todayGoals = updatedGoals.filter((goal) => goal.date === today);
      set({ goals: updatedGoals, todayGoals });

      useToastStore.getState().success('Goal transferred to tomorrow');
    } catch (error) {
      console.error('Error transferring goal:', error);
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

      const todayGoals = updatedGoals.filter((goal) => goal.date === today);
      set({ goals: updatedGoals, todayGoals });

      useToastStore.getState().success('Goal moved to today');
    } catch (error) {
      console.error('Error moving goal to today:', error);
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

    // Apply completion filter
    const filteredGoals =
      completionFilter === 'all'
        ? goals
        : goals.filter((goal) =>
            completionFilter === 'completed' ? goal.completed : !goal.completed
          );

    // Group by date (newest first)
    return groupGoalsByDate(filteredGoals, 'desc');
  },
}));
