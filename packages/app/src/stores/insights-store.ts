import {
  type AdvancedAnalytics,
  calculateAdvancedAnalytics,
  calculateInsights,
  downloadFile,
  EXPORT_FORMAT_VERSION,
  type ExportData,
  exportDailyTrendsCSV,
  exportGoalsCSV,
  exportMonthlyTrendsCSV,
  exportPomodoroSessionsCSV,
  exportWeeklyTrendsCSV,
  type Goal,
  getTodayDateString,
  type ImportOptions,
  type ImportResult,
  type ImportValidation,
  type InsightsData,
  logger,
  type PomodoroSession,
  parseImportData,
  type Quote,
} from '@cuewise/shared';
import {
  getGoals,
  getPomodoroSessions,
  getQuotes,
  setGoals,
  setPomodoroSessions,
  setQuotes,
} from '@cuewise/storage';
import { create } from 'zustand';
import { readFileAsText } from '../utils/file-utils';
import { useToastStore } from './toast-store';

/**
 * Merge incoming into existing by id (skipDuplicates drops existing ids, else overwrites them).
 * importedCount = items written: new ones in skip mode, all incoming (incl. overwrites) otherwise.
 */
function mergeImport<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  skipDuplicates: boolean
): { merged: T[]; importedCount: number; skippedCount: number } {
  const existingIds = new Set(existing.map((item) => item.id));
  const incomingIds = new Set(incoming.map((item) => item.id));
  const toImport = skipDuplicates ? incoming.filter((item) => !existingIds.has(item.id)) : incoming;

  const merged = skipDuplicates
    ? [...existing, ...toImport]
    : [...existing.filter((e) => !incomingIds.has(e.id)), ...incoming];

  return {
    merged,
    importedCount: toImport.length,
    skippedCount: incoming.length - toImport.length,
  };
}

interface InsightsStore {
  insights: InsightsData | null;
  analytics: AdvancedAnalytics | null;
  isLoading: boolean;
  error: string | null;

  // Data for export
  quotes: Quote[];
  goals: Goal[];
  pomodoroSessions: PomodoroSession[];

  // Import state
  importValidation: ImportValidation | null;
  isImporting: boolean;

  // Actions
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  exportAsJSON: () => void;
  exportAsCSV: (type: 'daily' | 'weekly' | 'monthly' | 'goals' | 'pomodoros') => void;
  exportAllAsJSON: () => void;

  // Import actions
  validateImportFile: (file: File) => Promise<ImportValidation>;
  executeImport: (options: ImportOptions) => Promise<ImportResult>;
  clearImportValidation: () => void;
}

export const useInsightsStore = create<InsightsStore>((set, get) => ({
  insights: null,
  analytics: null,
  isLoading: true,
  error: null,
  quotes: [],
  goals: [],
  pomodoroSessions: [],
  importValidation: null,
  isImporting: false,

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
      logger.error('Error initializing insights store', error);
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
      logger.error('Error refreshing insights', error);
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
      logger.error('Error exporting analytics', error);
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
      logger.error('Error exporting CSV', error);
      useToastStore.getState().error('Failed to export data');
    }
  },

  exportAllAsJSON: () => {
    try {
      const { insights, analytics, quotes, goals, pomodoroSessions } = get();

      // Filter to only include custom quotes (exclude default/curated quotes)
      const customQuotes = quotes.filter((quote) => quote.isCustom);

      const exportData: ExportData = {
        // Metadata for compatibility checking
        version: __APP_VERSION__,
        formatVersion: EXPORT_FORMAT_VERSION,
        exportDate: new Date().toISOString(),
        // Data (insights/analytics can be null for import-only exports)
        insights,
        analytics,
        goals,
        pomodoroSessions,
        quotes: customQuotes,
      };

      const json = JSON.stringify(exportData, null, 2);
      const filename = `cuewise-complete-export-${getTodayDateString()}.json`;
      downloadFile(json, filename, 'application/json');

      useToastStore.getState().success('Complete data exported successfully');
    } catch (error) {
      logger.error('Error exporting complete data', error);
      useToastStore.getState().error('Failed to export complete data');
    }
  },

  validateImportFile: async (file: File): Promise<ImportValidation> => {
    try {
      const jsonString = await readFileAsText(file);
      const validation = parseImportData(jsonString);
      set({ importValidation: validation, error: null });
      return validation;
    } catch (error) {
      logger.error('Error validating import file', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to read file';
      const validation: ImportValidation = {
        isValid: false,
        errors: [{ field: 'file', message: errorMessage }],
        warnings: [],
        data: null,
      };
      set({ importValidation: validation, error: errorMessage });
      useToastStore.getState().error('Failed to validate import file');
      return validation;
    }
  },

  executeImport: async (options: ImportOptions): Promise<ImportResult> => {
    const { importValidation } = get();

    if (importValidation?.isValid !== true || importValidation.data === null) {
      return {
        success: false,
        imported: { goals: 0, quotes: 0, pomodoroSessions: 0 },
        skipped: { goals: 0, quotes: 0, pomodoroSessions: 0 },
        errors: [{ field: 'validation', message: 'No valid import data available' }],
      };
    }

    set({ isImporting: true, error: null });

    // Track partial progress for accurate reporting on failure
    const result: ImportResult = {
      success: true,
      imported: { goals: 0, quotes: 0, pomodoroSessions: 0 },
      skipped: { goals: 0, quotes: 0, pomodoroSessions: 0 },
      errors: [],
    };

    try {
      const data = importValidation.data;

      // Import goals
      if (options.importGoals === true && data.goals.length > 0) {
        const existingGoals = await getGoals();
        const { merged, importedCount, skippedCount } = mergeImport(
          existingGoals,
          data.goals,
          options.skipDuplicates === true
        );
        result.imported.goals = importedCount;
        result.skipped.goals = skippedCount;
        if (importedCount > 0) {
          await setGoals(merged);
        }
      }

      // Import quotes (mark as custom to distinguish from seed quotes)
      if (options.importQuotes === true && data.quotes.length > 0) {
        const existingQuotes = await getQuotes();
        // Mark all imported quotes as custom to ensure they are included in future exports
        const quotesToProcess = data.quotes.map((q) => ({ ...q, isCustom: true }));
        const { merged, importedCount, skippedCount } = mergeImport(
          existingQuotes,
          quotesToProcess,
          options.skipDuplicates === true
        );
        result.imported.quotes = importedCount;
        result.skipped.quotes = skippedCount;
        if (importedCount > 0) {
          await setQuotes(merged);
        }
      }

      // Import pomodoro sessions
      if (options.importPomodoroSessions === true && data.pomodoroSessions.length > 0) {
        const existingSessions = await getPomodoroSessions();
        const { merged, importedCount, skippedCount } = mergeImport(
          existingSessions,
          data.pomodoroSessions,
          options.skipDuplicates === true
        );
        result.imported.pomodoroSessions = importedCount;
        result.skipped.pomodoroSessions = skippedCount;
        if (importedCount > 0) {
          await setPomodoroSessions(merged);
        }
      }

      // Refresh insights after import
      await get().refresh();

      const totalImported =
        result.imported.goals + result.imported.quotes + result.imported.pomodoroSessions;
      if (totalImported > 0) {
        useToastStore.getState().success(`Successfully imported ${totalImported} items`);
      } else {
        useToastStore.getState().warning('No new items to import');
      }

      set({ isImporting: false, importValidation: null });
      return result;
    } catch (error) {
      logger.error('Error executing import', error);

      let userMessage = 'Failed to import data. Please try again.';
      const technicalMessage =
        error instanceof Error ? error.message : 'Import failed unexpectedly';

      if (error instanceof Error) {
        if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
          userMessage = 'Storage space is full. Please clear some data and try again.';
        }
      }

      useToastStore.getState().error(userMessage);
      set({ isImporting: false, error: userMessage });

      // Return partial progress - some items may have been imported before the failure
      return {
        success: false,
        imported: result.imported,
        skipped: result.skipped,
        errors: [{ field: 'import', message: technicalMessage }],
      };
    }
  },

  clearImportValidation: () => {
    set({ importValidation: null, isImporting: false });
  },
}));
