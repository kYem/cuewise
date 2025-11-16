import {
  calculateAdvancedAnalytics,
  calculateInsights,
  downloadFile,
  exportDailyTrendsCSV,
  exportGoalsCSV,
  exportMonthlyTrendsCSV,
  exportPomodoroSessionsCSV,
  exportWeeklyTrendsCSV,
  getTodayDateString,
  type AdvancedAnalytics,
  type ExportData,
  type Goal,
  type InsightsData,
  type PomodoroSession,
  type Quote,
} from '@cuewise/shared';
import { getGoals, getPomodoroSessions, getQuotes } from '@cuewise/storage';
import { create } from 'zustand';
import { useToastStore } from './toast-store';

interface InsightsStore {
  insights: InsightsData | null;
  analytics: AdvancedAnalytics | null;
  isLoading: boolean;
  error: string | null;

  // Data for export
  quotes: Quote[];
  goals: Goal[];
  pomodoroSessions: PomodoroSession[];

  // Actions
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  exportAsJSON: () => void;
  exportAsCSV: (type: 'daily' | 'weekly' | 'monthly' | 'goals' | 'pomodoros') => void;
  exportAllAsJSON: () => void;
}

export const useInsightsStore = create<InsightsStore>((set, get) => ({
  insights: null,
  analytics: null,
  isLoading: true,
  error: null,
  quotes: [],
  goals: [],
  pomodoroSessions: [],

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      // Load all data needed for insights
      const [quotes, goals, pomodoroSessions] = await Promise.all([
        getQuotes(),
        getGoals(),
        getPomodoroSessions(),
      ]);

      // Calculate insights and analytics
      const insights = calculateInsights(quotes, goals, pomodoroSessions);
      const analytics = calculateAdvancedAnalytics(goals, pomodoroSessions);

      set({ insights, analytics, quotes, goals, pomodoroSessions, isLoading: false });
    } catch (error) {
      console.error('Error initializing insights store:', error);
      const errorMessage = 'Failed to load insights. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
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
      const analytics = calculateAdvancedAnalytics(goals, pomodoroSessions);

      set({ insights, analytics, quotes, goals, pomodoroSessions });
    } catch (error) {
      console.error('Error refreshing insights:', error);
      const errorMessage = 'Failed to refresh insights. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  exportAsJSON: () => {
    try {
      const { insights, analytics } = get();
      if (!insights || !analytics) {
        useToastStore.getState().error('No data available to export');
        return;
      }

      const exportData = {
        exportDate: new Date().toISOString(),
        insights,
        analytics,
      };

      const json = JSON.stringify(exportData, null, 2);
      const filename = `cuewise-analytics-${getTodayDateString()}.json`;
      downloadFile(json, filename, 'application/json');

      useToastStore.getState().success('Analytics exported successfully');
    } catch (error) {
      console.error('Error exporting analytics:', error);
      useToastStore.getState().error('Failed to export analytics');
    }
  },

  exportAsCSV: (type: 'daily' | 'weekly' | 'monthly' | 'goals' | 'pomodoros') => {
    try {
      const { analytics, goals, pomodoroSessions } = get();

      let csv = '';
      let filename = '';

      switch (type) {
        case 'daily':
          if (!analytics?.dailyTrends) {
            useToastStore.getState().error('No daily trends data available');
            return;
          }
          csv = exportDailyTrendsCSV(analytics.dailyTrends);
          filename = `cuewise-daily-trends-${getTodayDateString()}.csv`;
          break;
        case 'weekly':
          if (!analytics?.weeklyTrends) {
            useToastStore.getState().error('No weekly trends data available');
            return;
          }
          csv = exportWeeklyTrendsCSV(analytics.weeklyTrends);
          filename = `cuewise-weekly-trends-${getTodayDateString()}.csv`;
          break;
        case 'monthly':
          if (!analytics?.monthlyTrends) {
            useToastStore.getState().error('No monthly trends data available');
            return;
          }
          csv = exportMonthlyTrendsCSV(analytics.monthlyTrends);
          filename = `cuewise-monthly-trends-${getTodayDateString()}.csv`;
          break;
        case 'goals':
          if (!goals || goals.length === 0) {
            useToastStore.getState().error('No goals data available');
            return;
          }
          csv = exportGoalsCSV(goals);
          filename = `cuewise-goals-${getTodayDateString()}.csv`;
          break;
        case 'pomodoros':
          if (!pomodoroSessions || pomodoroSessions.length === 0) {
            useToastStore.getState().error('No pomodoro sessions data available');
            return;
          }
          csv = exportPomodoroSessionsCSV(pomodoroSessions);
          filename = `cuewise-pomodoros-${getTodayDateString()}.csv`;
          break;
      }

      downloadFile(csv, filename, 'text/csv');
      useToastStore.getState().success('Data exported successfully');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      useToastStore.getState().error('Failed to export data');
    }
  },

  exportAllAsJSON: () => {
    try {
      const { insights, analytics, quotes, goals, pomodoroSessions } = get();
      if (!insights || !analytics) {
        useToastStore.getState().error('No data available to export');
        return;
      }

      const exportData: ExportData = {
        exportDate: new Date().toISOString(),
        insights,
        analytics,
        goals,
        pomodoroSessions,
        quotes,
      };

      const json = JSON.stringify(exportData, null, 2);
      const filename = `cuewise-complete-export-${getTodayDateString()}.json`;
      downloadFile(json, filename, 'application/json');

      useToastStore.getState().success('Complete data exported successfully');
    } catch (error) {
      console.error('Error exporting complete data:', error);
      useToastStore.getState().error('Failed to export complete data');
    }
  },
}));
