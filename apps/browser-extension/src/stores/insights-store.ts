import { calculateInsights, type InsightsData } from '@cuewise/shared';
import { getGoals, getPomodoroSessions, getQuotes } from '@cuewise/storage';
import { create } from 'zustand';

interface InsightsStore {
  insights: InsightsData | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useInsightsStore = create<InsightsStore>((set) => ({
  insights: null,
  isLoading: true,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      // Load all data needed for insights
      const [quotes, goals, pomodoroSessions] = await Promise.all([
        getQuotes(),
        getGoals(),
        getPomodoroSessions(),
      ]);

      // Calculate insights
      const insights = calculateInsights(quotes, goals, pomodoroSessions);

      set({ insights, isLoading: false });
    } catch (error) {
      console.error('Error initializing insights store:', error);
      set({ error: 'Failed to load insights', isLoading: false });
    }
  },

  refresh: async () => {
    try {
      set({ error: null });

      // Reload data and recalculate insights
      const [quotes, goals, pomodoroSessions] = await Promise.all([
        getQuotes(),
        getGoals(),
        getPomodoroSessions(),
      ]);

      const insights = calculateInsights(quotes, goals, pomodoroSessions);

      set({ insights });
    } catch (error) {
      console.error('Error refreshing insights:', error);
      set({ error: 'Failed to refresh insights' });
    }
  },
}));
