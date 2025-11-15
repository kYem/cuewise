import { type Goal, generateId, getTodayDateString } from '@cuewise/shared';
import { getGoals, setGoals } from '@cuewise/storage';
import { create } from 'zustand';
import { useToastStore } from './toast-store';

interface GoalStore {
  goals: Goal[];
  todayGoals: Goal[];
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  addGoal: (text: string) => Promise<void>;
  toggleGoal: (goalId: string) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
}

export const useGoalStore = create<GoalStore>((set, get) => ({
  goals: [],
  todayGoals: [],
  isLoading: true,
  error: null,

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
}));
