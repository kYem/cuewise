import { describe, expect, it } from 'vitest';
import {
  createHeatmapTestSessions,
  createTestGoals,
  createTestPomodoroSessions,
  createTrendTestGoals,
} from './__fixtures__/analytics.fixtures';
import {
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  REMINDER_INTERVAL_MAX,
  REMINDER_INTERVAL_MIN,
  REMINDER_SNOOZE_MINUTES,
  REMINDER_TEMPLATES,
} from './constants';
import type { Goal } from './types';
import {
  addSubtaskToGoal,
  buildReminderRecurring,
  calculateAdvancedAnalytics,
  calculateDailyTrends,
  calculateGoalCompletionRate,
  calculateMonthlyTrends,
  calculatePomodoroHeatmap,
  calculateStreak,
  calculateWeeklyTrends,
  clampIntervalMinutes,
  compareVersions,
  duplicateGoal,
  exportDailyTrendsCSV,
  exportGoalsCSV,
  exportMonthlyTrendsCSV,
  exportPomodoroSessionsCSV,
  exportWeeklyTrendsCSV,
  formatCompactInterval,
  formatReminderCadence,
  getDueDateLabel,
  getNextDayDateString,
  getRandomQuote,
  getRecentIncompleteTasks,
  getSubtaskProgress,
  getTodayDateString,
  getUpcomingTasks,
  intervalDueDateFromNow,
  nextReminderDueDate,
  parseImportData,
  removeSubtaskFromGoal,
  reorderGoals,
  resolveReminderNotificationAction,
  shouldShowReviewPrompt,
  toggleSubtaskInGoal,
} from './utils';

describe('Analytics Utilities', () => {
  describe('calculateDailyTrends', () => {
    it('should calculate daily trends for the last 30 days', () => {
      const goals = createTrendTestGoals(30);
      const sessions = createTestPomodoroSessions();

      const trends = calculateDailyTrends(goals, sessions, 30);

      expect(trends).toHaveLength(30);
      expect(trends[0]).toHaveProperty('date');
      expect(trends[0]).toHaveProperty('goalsCompleted');
      expect(trends[0]).toHaveProperty('focusTime');
      expect(trends[0]).toHaveProperty('pomodorosCompleted');
    });

    it('should count completed goals correctly per day', () => {
      const goals = createTrendTestGoals(5);
      const sessions: ReturnType<typeof createTestPomodoroSessions> = [];

      const trends = calculateDailyTrends(goals, sessions, 5);

      // Each day should have 1 completed goal (first of each day)
      trends.forEach((trend) => {
        expect(trend.goalsCompleted).toBeGreaterThanOrEqual(0);
      });
    });

    it('should calculate focus time from completed work sessions', () => {
      const goals: ReturnType<typeof createTestGoals> = [];
      const sessions = createTestPomodoroSessions();

      const trends = calculateDailyTrends(goals, sessions, 5);

      // Today should have 3 sessions * 25 minutes = 75 minutes
      const todayTrend = trends[trends.length - 1];
      expect(todayTrend.focusTime).toBe(75);
      expect(todayTrend.pomodorosCompleted).toBe(3);
    });

    it('should exclude interrupted and break sessions', () => {
      const goals: ReturnType<typeof createTestGoals> = [];
      const sessions = createTestPomodoroSessions();

      const trends = calculateDailyTrends(goals, sessions, 5);

      // Should only count 4 work sessions (3 today + 1 yesterday)
      const totalPomodoros = trends.reduce((sum, t) => sum + t.pomodorosCompleted, 0);
      expect(totalPomodoros).toBe(4);
    });
  });

  describe('calculateWeeklyTrends', () => {
    it('should calculate weekly trends for the last 12 weeks', () => {
      const goals = createTrendTestGoals(90); // ~13 weeks
      const sessions = createTestPomodoroSessions();

      const trends = calculateWeeklyTrends(goals, sessions, 12);

      expect(trends.length).toBeGreaterThan(0);
      expect(trends.length).toBeLessThanOrEqual(13); // May have partial weeks
      expect(trends[0]).toHaveProperty('weekLabel');
      expect(trends[0]).toHaveProperty('goalsCompleted');
    });

    it('should format week labels correctly', () => {
      const goals = createTrendTestGoals(14);
      const sessions: ReturnType<typeof createTestPomodoroSessions> = [];

      const trends = calculateWeeklyTrends(goals, sessions, 2);

      trends.forEach((trend) => {
        expect(trend.weekLabel).toMatch(/[A-Z][a-z]{2} \d+-\d+/); // e.g., "Jan 8-14"
      });
    });
  });

  describe('calculateMonthlyTrends', () => {
    it('should calculate monthly trends for the last 6 months', () => {
      const goals = createTrendTestGoals(180); // ~6 months
      const sessions = createTestPomodoroSessions();

      const trends = calculateMonthlyTrends(goals, sessions, 6);

      expect(trends).toHaveLength(6);
      expect(trends[0]).toHaveProperty('month');
      expect(trends[0]).toHaveProperty('goalsCompleted');
      expect(trends[0]).toHaveProperty('focusTime');
    });

    it('should format month labels correctly', () => {
      const goals = createTrendTestGoals(30);
      const sessions: ReturnType<typeof createTestPomodoroSessions> = [];

      const trends = calculateMonthlyTrends(goals, sessions, 3);

      trends.forEach((trend) => {
        expect(trend.month).toMatch(/[A-Z][a-z]+ \d{4}/); // e.g., "January 2025"
      });
    });
  });

  describe('calculateGoalCompletionRate', () => {
    it('should calculate overall completion rate', () => {
      const goals = createTestGoals();

      const rate = calculateGoalCompletionRate(goals);

      expect(rate.totalGoals).toBe(6);
      expect(rate.completedGoals).toBe(4);
      expect(rate.completionRate).toBeCloseTo(66.67, 1);
    });

    it('should calculate weekly completion rate', () => {
      const goals = createTestGoals();

      const rate = calculateGoalCompletionRate(goals);

      expect(rate.thisWeek.totalGoals).toBeGreaterThanOrEqual(2);
      expect(rate.thisWeek.completionRate).toBeGreaterThanOrEqual(0);
      expect(rate.thisWeek.completionRate).toBeLessThanOrEqual(100);
    });

    it('should calculate monthly completion rate', () => {
      const goals = createTestGoals();

      const rate = calculateGoalCompletionRate(goals);

      expect(rate.thisMonth.totalGoals).toBeGreaterThanOrEqual(2);
      expect(rate.thisMonth.completionRate).toBeGreaterThanOrEqual(0);
      expect(rate.thisMonth.completionRate).toBeLessThanOrEqual(100);
    });

    it('should handle empty goals array', () => {
      const rate = calculateGoalCompletionRate([]);

      expect(rate.totalGoals).toBe(0);
      expect(rate.completedGoals).toBe(0);
      expect(rate.completionRate).toBe(0);
    });
  });

  describe('calculatePomodoroHeatmap', () => {
    it('should calculate hourly distribution', () => {
      const sessions = createHeatmapTestSessions();

      const heatmap = calculatePomodoroHeatmap(sessions);

      expect(heatmap.hourlyDistribution).toBeDefined();
      expect(Object.keys(heatmap.hourlyDistribution)).toHaveLength(24);
      // Most productive hour should be 14 (2 PM) with 3 sessions
      expect(heatmap.hourlyDistribution[14]).toBeGreaterThan(0);
    });

    it('should calculate weekday distribution', () => {
      const sessions = createHeatmapTestSessions();

      const heatmap = calculatePomodoroHeatmap(sessions);

      expect(heatmap.weekdayDistribution).toBeDefined();
      expect(Object.keys(heatmap.weekdayDistribution)).toHaveLength(7);
    });

    it('should identify top 3 productive hours', () => {
      const sessions = createHeatmapTestSessions();

      const heatmap = calculatePomodoroHeatmap(sessions);

      expect(heatmap.productiveHours).toBeDefined();
      expect(heatmap.productiveHours.length).toBeLessThanOrEqual(3);
    });

    it('should exclude interrupted and break sessions', () => {
      const sessions = createTestPomodoroSessions();

      const heatmap = calculatePomodoroHeatmap(sessions);

      const totalSessions = Object.values(heatmap.hourlyDistribution).reduce(
        (sum, count) => sum + count,
        0
      );
      // Should only count 4 work sessions (excluding interrupted and break)
      expect(totalSessions).toBe(4);
    });

    it('should handle empty sessions array', () => {
      const heatmap = calculatePomodoroHeatmap([]);

      // When empty, still returns top 3 hours but all with 0 count
      expect(heatmap.productiveHours).toHaveLength(3);
      expect(Object.values(heatmap.hourlyDistribution).every((v) => v === 0)).toBe(true);
    });
  });

  describe('calculateAdvancedAnalytics', () => {
    it('should calculate all analytics data', () => {
      const goals = createTestGoals();
      const sessions = createTestPomodoroSessions();

      const analytics = calculateAdvancedAnalytics(goals, sessions);

      expect(analytics).toHaveProperty('dailyTrends');
      expect(analytics).toHaveProperty('weeklyTrends');
      expect(analytics).toHaveProperty('monthlyTrends');
      expect(analytics).toHaveProperty('goalCompletionRate');
      expect(analytics).toHaveProperty('pomodoroHeatmap');
    });

    it('should have correct array lengths', () => {
      const goals = createTestGoals();
      const sessions = createTestPomodoroSessions();

      const analytics = calculateAdvancedAnalytics(goals, sessions);

      expect(analytics.dailyTrends).toHaveLength(30);
      expect(analytics.weeklyTrends.length).toBeGreaterThan(0);
      expect(analytics.monthlyTrends).toHaveLength(6);
    });
  });

  describe('CSV Export Functions', () => {
    describe('exportDailyTrendsCSV', () => {
      it('should export daily trends to CSV format', () => {
        const goals = createTrendTestGoals(3);
        const sessions = createTestPomodoroSessions();
        const trends = calculateDailyTrends(goals, sessions, 3);

        const csv = exportDailyTrendsCSV(trends);

        expect(csv).toContain('date,goalsCompleted,focusTime,pomodorosCompleted');
        expect(csv.split('\n').length).toBeGreaterThan(1);
      });
    });

    describe('exportWeeklyTrendsCSV', () => {
      it('should export weekly trends to CSV format', () => {
        const goals = createTrendTestGoals(14);
        const sessions = createTestPomodoroSessions();
        const trends = calculateWeeklyTrends(goals, sessions, 2);

        const csv = exportWeeklyTrendsCSV(trends);

        expect(csv).toContain('weekLabel,goalsCompleted,focusTime,pomodorosCompleted');
      });
    });

    describe('exportMonthlyTrendsCSV', () => {
      it('should export monthly trends to CSV format', () => {
        const goals = createTrendTestGoals(90);
        const sessions = createTestPomodoroSessions();
        const trends = calculateMonthlyTrends(goals, sessions, 3);

        const csv = exportMonthlyTrendsCSV(trends);

        expect(csv).toContain('month,goalsCompleted,focusTime,pomodorosCompleted');
      });
    });

    describe('exportGoalsCSV', () => {
      it('should export goals to CSV format', () => {
        const goals = createTestGoals();

        const csv = exportGoalsCSV(goals);

        expect(csv).toContain('id,text,completed,createdAt,date');
        expect(csv).toContain('goal-1');
        expect(csv.split('\n').length).toBe(goals.length + 1); // Header + data rows
      });

      it('should handle commas in goal text', () => {
        const goals = [
          {
            id: 'goal-1',
            text: 'Write tests, review code',
            completed: true,
            createdAt: new Date().toISOString(),
            date: new Date().toISOString().split('T')[0],
          },
        ];

        const csv = exportGoalsCSV(goals);

        expect(csv).toContain('"Write tests, review code"');
      });
    });

    describe('exportPomodoroSessionsCSV', () => {
      it('should export pomodoro sessions to CSV format', () => {
        const sessions = createTestPomodoroSessions();

        const csv = exportPomodoroSessionsCSV(sessions);

        expect(csv).toContain('id,startedAt,completedAt,interrupted,duration,type,goalId');
        expect(csv).toContain('session-1');
      });

      it('should handle optional fields', () => {
        const sessions = [
          {
            id: 'session-1',
            startedAt: new Date().toISOString(),
            interrupted: true,
            duration: 25,
            type: 'work' as const,
          },
        ];

        const csv = exportPomodoroSessionsCSV(sessions);

        // completedAt and goalId should be empty strings
        expect(csv).toContain(',,true');
      });
    });
  });
});

describe('Import Utilities', () => {
  describe('parseImportData', () => {
    it('should return error for invalid JSON', () => {
      const result = parseImportData('not valid json');

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('json');
      expect(result.errors[0].message).toBe('Invalid JSON format');
      expect(result.data).toBeNull();
    });

    it('should return error for non-object data', () => {
      const result = parseImportData('"string"');

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('root');
    });

    it('should return error for array data', () => {
      const result = parseImportData('[]');

      expect(result.isValid).toBe(false);
      expect(result.errors[0].field).toBe('root');
      expect(result.errors[0].message).toBe('Export data must be an object');
    });

    it('should validate valid export data', () => {
      const validData = {
        version: '1.0.0',
        formatVersion: 1,
        exportDate: new Date().toISOString(),
        goals: [
          {
            id: 'goal-1',
            text: 'Test goal',
            completed: false,
            createdAt: new Date().toISOString(),
            date: '2025-01-15',
          },
        ],
        quotes: [{ id: 'quote-1', text: 'Test quote', author: 'Author' }],
        pomodoroSessions: [
          { id: 'session-1', startedAt: new Date().toISOString(), duration: 25, type: 'work' },
        ],
        insights: null,
        analytics: null,
      };

      const result = parseImportData(JSON.stringify(validData));

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data).not.toBeNull();
      expect(result.data?.goals).toHaveLength(1);
      expect(result.data?.quotes).toHaveLength(1);
      expect(result.data?.pomodoroSessions).toHaveLength(1);
    });

    it('should add warning for missing formatVersion (legacy export)', () => {
      const legacyData = {
        goals: [],
        quotes: [],
        pomodoroSessions: [],
      };

      const result = parseImportData(JSON.stringify(legacyData));

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        'This export file does not have a format version. It may be from an older version of Cuewise.'
      );
    });

    it('should return error for unsupported format version', () => {
      const futureData = {
        version: '99.0.0',
        formatVersion: 999,
        goals: [],
        quotes: [],
        pomodoroSessions: [],
      };

      const result = parseImportData(JSON.stringify(futureData));

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === 'formatVersion')).toBe(true);
    });

    it('should add warnings for missing arrays', () => {
      const minimalData = {};

      const result = parseImportData(JSON.stringify(minimalData));

      expect(result.warnings).toContain('No goals found in export file');
      expect(result.warnings).toContain('No quotes found in export file');
      expect(result.warnings).toContain('No pomodoro sessions found in export file');
    });

    it('should validate goal fields', () => {
      const dataWithInvalidGoal = {
        formatVersion: 1,
        goals: [
          { text: 'Missing id' }, // Missing id
          { id: 'valid-1', text: 'Valid goal' }, // Valid
        ],
        quotes: [],
        pomodoroSessions: [],
      };

      const result = parseImportData(JSON.stringify(dataWithInvalidGoal));

      expect(result.errors.some((e) => e.field === 'goals[0].id')).toBe(true);
      expect(result.data?.goals).toHaveLength(1);
      expect(result.data?.goals[0].id).toBe('valid-1');
    });

    it('should validate quote fields', () => {
      const dataWithInvalidQuote = {
        formatVersion: 1,
        goals: [],
        quotes: [
          { id: 'quote-1' }, // Missing text
          { id: 'quote-2', text: 'Valid quote' }, // Valid
        ],
        pomodoroSessions: [],
      };

      const result = parseImportData(JSON.stringify(dataWithInvalidQuote));

      expect(result.errors.some((e) => e.field === 'quotes[0].text')).toBe(true);
      expect(result.data?.quotes).toHaveLength(1);
      expect(result.data?.quotes[0].id).toBe('quote-2');
    });

    it('should validate pomodoro session fields', () => {
      const dataWithInvalidSession = {
        formatVersion: 1,
        goals: [],
        quotes: [],
        pomodoroSessions: [
          { id: 'session-1' }, // Missing startedAt
          { id: 'session-2', startedAt: new Date().toISOString() }, // Valid
        ],
      };

      const result = parseImportData(JSON.stringify(dataWithInvalidSession));

      expect(result.errors.some((e) => e.field === 'pomodoroSessions[0].startedAt')).toBe(true);
      expect(result.data?.pomodoroSessions).toHaveLength(1);
      expect(result.data?.pomodoroSessions[0].id).toBe('session-2');
    });

    it('should mark all imported quotes as custom', () => {
      const data = {
        formatVersion: 1,
        goals: [],
        quotes: [{ id: 'quote-1', text: 'Test', isCustom: false }],
        pomodoroSessions: [],
      };

      const result = parseImportData(JSON.stringify(data));

      expect(result.data?.quotes[0].isCustom).toBe(true);
    });

    it('should provide default values for optional fields', () => {
      const minimalGoal = { id: 'goal-1', text: 'Test' };
      const minimalQuote = { id: 'quote-1', text: 'Test' };
      const minimalSession = { id: 'session-1', startedAt: new Date().toISOString() };

      const data = {
        formatVersion: 1,
        goals: [minimalGoal],
        quotes: [minimalQuote],
        pomodoroSessions: [minimalSession],
      };

      const result = parseImportData(JSON.stringify(data));

      // Goal defaults
      expect(result.data?.goals[0].completed).toBe(false);
      expect(result.data?.goals[0].createdAt).toBeDefined();
      expect(result.data?.goals[0].date).toBeDefined();

      // Quote defaults
      expect(result.data?.quotes[0].author).toBe('Unknown');
      expect(result.data?.quotes[0].category).toBe('inspiration');
      expect(result.data?.quotes[0].isFavorite).toBe(false);
      expect(result.data?.quotes[0].isHidden).toBe(false);
      expect(result.data?.quotes[0].viewCount).toBe(0);

      // Session defaults
      expect(result.data?.pomodoroSessions[0].interrupted).toBe(false);
      expect(result.data?.pomodoroSessions[0].duration).toBe(25);
      expect(result.data?.pomodoroSessions[0].type).toBe('work');
    });
  });

  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
    });

    it('should return -1 when first version is less', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    it('should return 1 when first version is greater', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });

    it('should handle versions with different number of parts', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0')).toBe(0);
      expect(compareVersions('1.0', '1.0.1')).toBe(-1);
    });
  });

  describe('getRandomQuote with category filtering', () => {
    it('should filter quotes by enabled categories', () => {
      const quotes = [
        {
          id: '1',
          text: 'Quote 1',
          author: 'Author 1',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
        {
          id: '2',
          text: 'Quote 2',
          author: 'Author 2',
          category: 'productivity' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
        {
          id: '3',
          text: 'Quote 3',
          author: 'Author 3',
          category: 'learning' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
      ];

      // Only enable 'productivity' category
      const result = getRandomQuote(quotes, undefined, ['productivity']);

      expect(result).not.toBeNull();
      expect(result?.category).toBe('productivity');
    });

    it('should return null when no quotes match enabled categories', () => {
      const quotes = [
        {
          id: '1',
          text: 'Quote 1',
          author: 'Author 1',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
      ];

      // Enable a category that has no quotes
      const result = getRandomQuote(quotes, undefined, ['productivity']);

      expect(result).toBeNull();
    });

    it('should return null when enabled categories array is empty', () => {
      const quotes = [
        {
          id: '1',
          text: 'Quote 1',
          author: 'Author 1',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
      ];

      // Empty categories array should return null
      const result = getRandomQuote(quotes, undefined, []);

      expect(result).toBeNull();
    });

    it('should respect both hidden filter and category filter', () => {
      const quotes = [
        {
          id: '1',
          text: 'Quote 1',
          author: 'Author 1',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: true, // Hidden
          viewCount: 0,
        },
        {
          id: '2',
          text: 'Quote 2',
          author: 'Author 2',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false, // Visible
          viewCount: 0,
        },
      ];

      const result = getRandomQuote(quotes, undefined, ['inspiration']);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('2'); // Should get the non-hidden one
    });

    it('should include all quotes when enabledCategories is undefined', () => {
      const quotes = [
        {
          id: '1',
          text: 'Quote 1',
          author: 'Author 1',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
      ];

      const result = getRandomQuote(quotes, undefined, undefined);

      expect(result).not.toBeNull();
    });
  });

  describe('getRandomQuote with favorites filtering (OR logic)', () => {
    it('should include favorites when showFavorites is true (even without categories)', () => {
      const quotes = [
        {
          id: '1',
          text: 'Quote 1',
          author: 'Author 1',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: true,
          isHidden: false,
          viewCount: 0,
        },
        {
          id: '2',
          text: 'Quote 2',
          author: 'Author 2',
          category: 'productivity' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
      ];

      // No categories enabled, but favorites enabled - should return only favorites
      const result = getRandomQuote(quotes, undefined, [], false, true);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('1');
      expect(result?.isFavorite).toBe(true);
    });

    it('should return null when showFavorites is true but no favorites exist and no other filters', () => {
      const quotes = [
        {
          id: '1',
          text: 'Quote 1',
          author: 'Author 1',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
      ];

      // No categories, no custom, only favorites filter - but no favorites exist
      const result = getRandomQuote(quotes, undefined, [], false, true);

      expect(result).toBeNull();
    });

    it('should combine favorites filter with category filter using OR logic', () => {
      const quotes = [
        {
          id: '1',
          text: 'Quote 1',
          author: 'Author 1',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: true,
          isHidden: false,
          viewCount: 0,
        },
        {
          id: '2',
          text: 'Quote 2',
          author: 'Author 2',
          category: 'productivity' as const,
          isCustom: false,
          isFavorite: true,
          isHidden: false,
          viewCount: 0,
        },
        {
          id: '3',
          text: 'Quote 3',
          author: 'Author 3',
          category: 'productivity' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
      ];

      // productivity category OR favorites - should return quotes 2 and 3 (both productivity) and quote 1 (favorite)
      const result = getRandomQuote(quotes, undefined, ['productivity'], false, true);

      expect(result).not.toBeNull();
      // Result should be either productivity OR favorite
      const isProductivity = result?.category === 'productivity';
      const isFavorite = result?.isFavorite === true;
      expect(isProductivity || isFavorite).toBe(true);
    });

    it('should return category quotes when showFavorites is false', () => {
      const quotes = [
        {
          id: '1',
          text: 'Quote 1',
          author: 'Author 1',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: true,
          isHidden: false,
          viewCount: 0,
        },
        {
          id: '2',
          text: 'Quote 2',
          author: 'Author 2',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
      ];

      const result = getRandomQuote(quotes, undefined, ['inspiration'], true, false);

      expect(result).not.toBeNull();
    });

    it('should respect hidden filter combined with favorites filter', () => {
      const quotes = [
        {
          id: '1',
          text: 'Quote 1',
          author: 'Author 1',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: true,
          isHidden: true, // Hidden favorite
          viewCount: 0,
        },
        {
          id: '2',
          text: 'Quote 2',
          author: 'Author 2',
          category: 'inspiration' as const,
          isCustom: false,
          isFavorite: true,
          isHidden: false, // Visible favorite
          viewCount: 0,
        },
      ];

      const result = getRandomQuote(quotes, undefined, undefined, true, true);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('2'); // Should get the non-hidden favorite
    });
  });
});

// ============================================================================
// Subtask, duplication, reordering, and due date utilities
// ============================================================================

function createTestTask(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'task-1',
    text: 'Test task',
    completed: false,
    createdAt: new Date().toISOString(),
    date: getTodayDateString(),
    type: 'task',
    ...overrides,
  };
}

describe('Subtask Utilities', () => {
  describe('addSubtaskToGoal', () => {
    it('should add a subtask to a goal with no subtasks', () => {
      const goal = createTestTask();
      const result = addSubtaskToGoal(goal, 'New subtask');

      expect(result.subtasks).toHaveLength(1);
      expect(result.subtasks?.[0].text).toBe('New subtask');
      expect(result.subtasks?.[0].completed).toBe(false);
      expect(result.subtasks?.[0].id).toBeTruthy();
    });

    it('should append a subtask to existing subtasks', () => {
      const goal = createTestTask({
        subtasks: [{ id: 'sub-1', text: 'Existing', completed: true }],
      });
      const result = addSubtaskToGoal(goal, 'Second subtask');

      expect(result.subtasks).toHaveLength(2);
      expect(result.subtasks?.[0].text).toBe('Existing');
      expect(result.subtasks?.[1].text).toBe('Second subtask');
    });

    it('should not mutate the original goal', () => {
      const goal = createTestTask();
      addSubtaskToGoal(goal, 'New subtask');

      expect(goal.subtasks).toBeUndefined();
    });
  });

  describe('toggleSubtaskInGoal', () => {
    it('should toggle a subtask from incomplete to complete', () => {
      const goal = createTestTask({
        subtasks: [{ id: 'sub-1', text: 'Task', completed: false }],
      });
      const result = toggleSubtaskInGoal(goal, 'sub-1');

      expect(result.subtasks?.[0].completed).toBe(true);
    });

    it('should toggle a subtask from complete to incomplete', () => {
      const goal = createTestTask({
        subtasks: [{ id: 'sub-1', text: 'Task', completed: true }],
      });
      const result = toggleSubtaskInGoal(goal, 'sub-1');

      expect(result.subtasks?.[0].completed).toBe(false);
    });

    it('should not affect other subtasks', () => {
      const goal = createTestTask({
        subtasks: [
          { id: 'sub-1', text: 'First', completed: false },
          { id: 'sub-2', text: 'Second', completed: true },
        ],
      });
      const result = toggleSubtaskInGoal(goal, 'sub-1');

      expect(result.subtasks?.[0].completed).toBe(true);
      expect(result.subtasks?.[1].completed).toBe(true);
    });

    it('should handle non-existent subtask ID gracefully', () => {
      const goal = createTestTask({
        subtasks: [{ id: 'sub-1', text: 'Task', completed: false }],
      });
      const result = toggleSubtaskInGoal(goal, 'non-existent');

      expect(result.subtasks?.[0].completed).toBe(false);
    });

    it('completes the parent goal when the last incomplete subtask is checked', () => {
      const goal = createTestTask({
        completed: false,
        subtasks: [
          { id: 'sub-1', text: 'First', completed: true },
          { id: 'sub-2', text: 'Second', completed: false },
        ],
      });
      const result = toggleSubtaskInGoal(goal, 'sub-2');

      expect(result.subtasks?.every((s) => s.completed)).toBe(true);
      expect(result.completed).toBe(true);
    });

    it('reopens a completed parent goal when a subtask is unchecked', () => {
      const goal = createTestTask({
        completed: true,
        subtasks: [
          { id: 'sub-1', text: 'First', completed: true },
          { id: 'sub-2', text: 'Second', completed: true },
        ],
      });
      const result = toggleSubtaskInGoal(goal, 'sub-2');

      expect(result.completed).toBe(false);
    });
  });

  describe('removeSubtaskFromGoal', () => {
    it('should remove a subtask by ID', () => {
      const goal = createTestTask({
        subtasks: [
          { id: 'sub-1', text: 'First', completed: false },
          { id: 'sub-2', text: 'Second', completed: true },
        ],
      });
      const result = removeSubtaskFromGoal(goal, 'sub-1');

      expect(result.subtasks).toHaveLength(1);
      expect(result.subtasks?.[0].id).toBe('sub-2');
    });

    it('should return empty subtasks array when removing the last subtask', () => {
      const goal = createTestTask({
        subtasks: [{ id: 'sub-1', text: 'Only', completed: false }],
      });
      const result = removeSubtaskFromGoal(goal, 'sub-1');

      expect(result.subtasks).toHaveLength(0);
    });
  });

  describe('getSubtaskProgress', () => {
    it('should return zero counts for a goal with no subtasks', () => {
      const goal = createTestTask();
      const progress = getSubtaskProgress(goal);

      expect(progress).toEqual({ completed: 0, total: 0 });
    });

    it('should count completed and total subtasks', () => {
      const goal = createTestTask({
        subtasks: [
          { id: 'sub-1', text: 'Done', completed: true },
          { id: 'sub-2', text: 'Not done', completed: false },
          { id: 'sub-3', text: 'Also done', completed: true },
        ],
      });
      const progress = getSubtaskProgress(goal);

      expect(progress).toEqual({ completed: 2, total: 3 });
    });
  });
});

describe('duplicateGoal', () => {
  it('should create a copy with a new ID', () => {
    const goal = createTestTask({ text: 'Original task' });
    const copy = duplicateGoal(goal);

    expect(copy.id).not.toBe(goal.id);
    expect(copy.text).toBe('Original task');
  });

  it('should reset completed and transferCount', () => {
    const goal = createTestTask({ completed: true, transferCount: 3 });
    const copy = duplicateGoal(goal);

    expect(copy.completed).toBe(false);
    expect(copy.transferCount).toBe(0);
  });

  it('should deep-copy subtasks with new IDs and reset completion', () => {
    const goal = createTestTask({
      subtasks: [
        { id: 'sub-1', text: 'Subtask A', completed: true },
        { id: 'sub-2', text: 'Subtask B', completed: false },
      ],
    });
    const copy = duplicateGoal(goal);

    expect(copy.subtasks).toHaveLength(2);
    expect(copy.subtasks?.[0].id).not.toBe('sub-1');
    expect(copy.subtasks?.[0].text).toBe('Subtask A');
    expect(copy.subtasks?.[0].completed).toBe(false);
    expect(copy.subtasks?.[1].text).toBe('Subtask B');
    expect(copy.subtasks?.[1].completed).toBe(false);
  });

  it('should preserve dueDate and parentId', () => {
    const goal = createTestTask({ dueDate: '2026-04-15', parentId: 'obj-1' });
    const copy = duplicateGoal(goal);

    expect(copy.dueDate).toBe('2026-04-15');
    expect(copy.parentId).toBe('obj-1');
  });
});

describe('reorderGoals', () => {
  it('should move a goal from one position to another', () => {
    const goals = [
      createTestTask({ id: 'a', text: 'A' }),
      createTestTask({ id: 'b', text: 'B' }),
      createTestTask({ id: 'c', text: 'C' }),
    ];
    const result = reorderGoals(goals, 0, 2);

    expect(result.map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });

  it('should assign correct sortOrder values', () => {
    const goals = [
      createTestTask({ id: 'a' }),
      createTestTask({ id: 'b' }),
      createTestTask({ id: 'c' }),
    ];
    const result = reorderGoals(goals, 2, 0);

    expect(result[0].sortOrder).toBe(0);
    expect(result[1].sortOrder).toBe(1);
    expect(result[2].sortOrder).toBe(2);
  });

  it('should return the same array when from and to are equal', () => {
    const goals = [createTestTask({ id: 'a' }), createTestTask({ id: 'b' })];
    const result = reorderGoals(goals, 1, 1);

    expect(result.map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('should return the same array for out-of-bounds indices', () => {
    const goals = [createTestTask({ id: 'a' })];
    const result = reorderGoals(goals, -1, 5);

    expect(result).toEqual(goals);
  });
});

describe('calculateStreak', () => {
  // Local yyyy-MM-dd offset from today, matching how the app stores goal dates.
  const dayString = (offset: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('returns zero for no dates', () => {
    expect(calculateStreak([])).toEqual({ current: 0, longest: 0 });
  });

  it('counts consecutive days ending today, de-duplicating repeats', () => {
    const dates = [dayString(0), dayString(0), dayString(-1), dayString(-2)];
    expect(calculateStreak(dates)).toEqual({ current: 3, longest: 3 });
  });

  it('ignores future-dated entries so they cannot collapse the current streak', () => {
    // Tomorrow would otherwise sort to index 0 and break the today-anchored run.
    expect(calculateStreak([dayString(1), dayString(0), dayString(-1)]).current).toBe(2);
  });

  it('reports a current streak of zero when the run ended before today', () => {
    expect(calculateStreak([dayString(-1), dayString(-2)]).current).toBe(0);
  });
});

describe('Due Date Utilities', () => {
  describe('getUpcomingTasks', () => {
    it('should return tasks with a future dueDate', () => {
      const tomorrow = getNextDayDateString();
      const goals = [
        createTestTask({ id: '1', dueDate: tomorrow }),
        createTestTask({ id: '2' }), // No dueDate
        createTestTask({ id: '3', dueDate: getTodayDateString() }), // Today, not upcoming
        createTestTask({ id: '4', type: 'objective', dueDate: tomorrow }), // Objective, not task
      ];
      const result = getUpcomingTasks(goals);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array when no tasks have future due dates', () => {
      const goals = [createTestTask({ id: '1' }), createTestTask({ id: '2' })];
      const result = getUpcomingTasks(goals);

      expect(result).toEqual([]);
    });
  });

  describe('getRecentIncompleteTasks', () => {
    const daysAgo = (n: number): string =>
      new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    it('returns incomplete tasks dated in the recent past', () => {
      const goals = [createTestTask({ id: '1', date: daysAgo(2) })];
      const result = getRecentIncompleteTasks(goals);

      expect(result.map((g) => g.id)).toEqual(['1']);
    });

    it("excludes today's tasks", () => {
      const goals = [createTestTask({ id: '1', date: getTodayDateString() })];

      expect(getRecentIncompleteTasks(goals)).toEqual([]);
    });

    it('excludes completed tasks', () => {
      const goals = [createTestTask({ id: '1', date: daysAgo(2), completed: true })];

      expect(getRecentIncompleteTasks(goals)).toEqual([]);
    });

    it('excludes tasks older than the day window', () => {
      const recent = createTestTask({ id: 'recent', date: daysAgo(10) });
      const old = createTestTask({ id: 'old', date: daysAgo(20) });
      const result = getRecentIncompleteTasks([recent, old]);

      expect(result.map((g) => g.id)).toEqual(['recent']);
    });

    it('respects a custom daysBack window', () => {
      const goals = [createTestTask({ id: '1', date: daysAgo(5) })];

      expect(getRecentIncompleteTasks(goals, 3)).toEqual([]);
      expect(getRecentIncompleteTasks(goals, 7).map((g) => g.id)).toEqual(['1']);
    });

    it('excludes objectives (only tasks belong in the backlog)', () => {
      const goals = [createTestTask({ id: '1', date: daysAgo(2), type: 'objective' })];

      expect(getRecentIncompleteTasks(goals)).toEqual([]);
    });
  });

  describe('shouldShowReviewPrompt', () => {
    const base = {
      streakCurrent: 0,
      completedPomodoros: 0,
      hasSeenOnboarding: true,
      state: { dismissed: false, count: 0, lastShownAt: null as string | null },
      today: '2026-06-11',
    };

    it('shows once a delight milestone is reached (7-day streak)', () => {
      expect(shouldShowReviewPrompt({ ...base, streakCurrent: 7 })).toBe(true);
    });

    it('shows once 10 pomodoros are completed', () => {
      expect(shouldShowReviewPrompt({ ...base, completedPomodoros: 10 })).toBe(true);
    });

    it('does not show below either threshold', () => {
      expect(shouldShowReviewPrompt({ ...base, streakCurrent: 6, completedPomodoros: 9 })).toBe(
        false
      );
    });

    it('does not show before onboarding is complete', () => {
      expect(shouldShowReviewPrompt({ ...base, streakCurrent: 7, hasSeenOnboarding: false })).toBe(
        false
      );
    });

    it('does not show once permanently dismissed', () => {
      expect(
        shouldShowReviewPrompt({
          ...base,
          streakCurrent: 7,
          state: { ...base.state, dismissed: true },
        })
      ).toBe(false);
    });

    it('does not show after it has been shown twice', () => {
      expect(
        shouldShowReviewPrompt({
          ...base,
          streakCurrent: 7,
          state: { dismissed: false, count: 2, lastShownAt: '2026-06-01' },
        })
      ).toBe(false);
    });

    it('spaces the second ask at least 7 days after the first', () => {
      const seen = { dismissed: false, count: 1 };
      // 6 days later — too soon
      expect(
        shouldShowReviewPrompt({
          ...base,
          streakCurrent: 7,
          state: { ...seen, lastShownAt: '2026-06-05' },
        })
      ).toBe(false);
      // 7 days later — eligible again
      expect(
        shouldShowReviewPrompt({
          ...base,
          streakCurrent: 7,
          state: { ...seen, lastShownAt: '2026-06-04' },
        })
      ).toBe(true);
    });

    it('shows on the first eligible milestone (count 0, no lastShownAt)', () => {
      expect(shouldShowReviewPrompt({ ...base, completedPomodoros: 10 })).toBe(true);
    });

    it('shows when both signals are met', () => {
      expect(shouldShowReviewPrompt({ ...base, streakCurrent: 7, completedPomodoros: 10 })).toBe(
        true
      );
    });

    it('stays hidden when a prior show has no/invalid lastShownAt', () => {
      const seen = { dismissed: false, count: 1 };
      expect(
        shouldShowReviewPrompt({ ...base, streakCurrent: 7, state: { ...seen, lastShownAt: null } })
      ).toBe(false);
      expect(
        shouldShowReviewPrompt({
          ...base,
          streakCurrent: 7,
          state: { ...seen, lastShownAt: 'not-a-date' },
        })
      ).toBe(false);
    });
  });

  describe('getDueDateLabel', () => {
    it('should return "Today" for today', () => {
      expect(getDueDateLabel(getTodayDateString())).toBe('Today');
    });

    it('should return "Tomorrow" for tomorrow', () => {
      expect(getDueDateLabel(getNextDayDateString())).toBe('Tomorrow');
    });

    it('should return abbreviated date for far future dates', () => {
      const farFuture = '2027-06-15';
      const label = getDueDateLabel(farFuture);

      expect(label).toContain('Jun');
      expect(label).toContain('15');
    });

    it('should return day name for dates within this week (2-6 days ahead)', () => {
      // 3 days from now
      const threeDaysOut = new Date();
      threeDaysOut.setDate(threeDaysOut.getDate() + 3);
      const dateStr = threeDaysOut.toISOString().split('T')[0];
      const label = getDueDateLabel(dateStr);

      // Should be a full day name like "Monday", "Tuesday", etc.
      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      expect(dayNames).toContain(label);
    });

    it('should return abbreviated date for past due dates', () => {
      const pastDate = '2025-01-15';
      const label = getDueDateLabel(pastDate);

      expect(label).toBe('Jan 15');
    });
  });
});

describe('clampIntervalMinutes', () => {
  it('returns the value when within range', () => {
    expect(clampIntervalMinutes(1)).toBe(1);
    expect(clampIntervalMinutes(30)).toBe(30);
    expect(clampIntervalMinutes(REMINDER_INTERVAL_MAX)).toBe(480);
  });

  it('floors to an integer', () => {
    expect(clampIntervalMinutes(30.7)).toBe(30);
  });

  it('clamps below the minimum up to 1', () => {
    expect(clampIntervalMinutes(0)).toBe(REMINDER_INTERVAL_MIN);
    expect(clampIntervalMinutes(-5)).toBe(REMINDER_INTERVAL_MIN);
  });

  it('clamps above the maximum down to 480', () => {
    expect(clampIntervalMinutes(10000)).toBe(REMINDER_INTERVAL_MAX);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampIntervalMinutes(Number.NaN)).toBe(DEFAULT_REMINDER_INTERVAL_MINUTES);
    expect(clampIntervalMinutes(Number.POSITIVE_INFINITY)).toBe(REMINDER_INTERVAL_MAX);
    expect(clampIntervalMinutes(Number.NEGATIVE_INFINITY)).toBe(REMINDER_INTERVAL_MIN);
  });
});

describe('formatCompactInterval', () => {
  it('renders sub-hour minutes with an "m" suffix', () => {
    expect(formatCompactInterval(30)).toBe('30m');
    expect(formatCompactInterval(45)).toBe('45m');
  });

  it('renders whole hours with an "h" suffix', () => {
    expect(formatCompactInterval(60)).toBe('1h');
    expect(formatCompactInterval(180)).toBe('3h');
  });

  it('renders hours and minutes together', () => {
    expect(formatCompactInterval(90)).toBe('1h 30m');
  });
});

describe('nextReminderDueDate', () => {
  const base = {
    id: 'r1',
    text: 'x',
    completed: false,
    notified: false,
  } as const;

  it("anchors 'interval' to fire-time (now + intervalMinutes)", () => {
    const now = new Date('2026-06-13T10:00:00.000Z');
    const reminder = {
      ...base,
      dueDate: '2026-06-13T09:00:00.000Z', // stale; must be ignored
      recurring: { frequency: 'interval' as const, intervalMinutes: 30 },
    };
    expect(nextReminderDueDate(reminder, now).toISOString()).toBe('2026-06-13T10:30:00.000Z');
  });

  it("advances 'daily' to the next future occurrence", () => {
    const now = new Date('2026-06-13T10:00:00.000Z');
    const reminder = {
      ...base,
      dueDate: '2026-06-10T08:00:00.000Z', // 3 days overdue
      recurring: { frequency: 'daily' as const },
    };
    expect(nextReminderDueDate(reminder, now).toISOString()).toBe('2026-06-14T08:00:00.000Z');
  });

  it("advances 'weekly' by 7 days from the due date", () => {
    const now = new Date('2026-06-13T10:00:00.000Z');
    const reminder = {
      ...base,
      dueDate: '2026-06-12T08:00:00.000Z',
      recurring: { frequency: 'weekly' as const },
    };
    expect(nextReminderDueDate(reminder, now).toISOString()).toBe('2026-06-19T08:00:00.000Z');
  });
});

describe('REMINDER_TEMPLATES move preset', () => {
  it('includes a 30-minute interval movement template', () => {
    const move = REMINDER_TEMPLATES.find((t) => t.id === 'move');
    expect(move).toBeDefined();
    expect(move?.frequency).toBe('interval');
    expect(move?.intervalMinutes).toBe(30);
    expect(move?.category).toBe('health');
  });
});

describe('formatReminderCadence', () => {
  it('formats interval reminders in minutes', () => {
    expect(formatReminderCadence({ frequency: 'interval', intervalMinutes: 30 })).toBe(
      'every 30 min'
    );
  });
  it('passes calendar frequencies through', () => {
    expect(formatReminderCadence({ frequency: 'daily' })).toBe('daily');
  });
});

describe('buildReminderRecurring', () => {
  it('returns undefined when not recurring', () => {
    expect(buildReminderRecurring(false, 'daily', 30)).toBeUndefined();
  });

  it('returns a frequency-only payload for calendar cadences', () => {
    expect(buildReminderRecurring(true, 'daily', 30)).toEqual({ frequency: 'daily' });
  });

  it('carries intervalMinutes for interval cadences', () => {
    expect(buildReminderRecurring(true, 'interval', 30)).toEqual({
      frequency: 'interval',
      intervalMinutes: 30,
    });
  });
});

describe('intervalDueDateFromNow', () => {
  it('returns a Date roughly N minutes in the future', () => {
    const before = Date.now();
    const d = intervalDueDateFromNow(30);
    expect(d.getTime()).toBeGreaterThanOrEqual(before + 30 * 60_000);
    expect(d.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60_000 + 1000);
  });
});

describe('resolveReminderNotificationAction', () => {
  const base = {
    id: 'r1',
    text: 'x',
    dueDate: '2026-06-13T09:00:00.000Z',
    completed: false,
    notified: false,
  } as const;
  const now = new Date('2026-06-13T10:00:00.000Z');
  const expectedSnoozeDueDate = new Date(
    now.getTime() + REMINDER_SNOOZE_MINUTES * 60_000
  ).toISOString();

  it('Done completes a one-off reminder', () => {
    const reminder = { ...base, recurring: undefined };
    expect(resolveReminderNotificationAction(reminder, 0, now)).toEqual({ type: 'complete' });
  });

  it('Done dismisses an active recurring reminder', () => {
    const reminder = { ...base, recurring: { frequency: 'daily' as const } };
    expect(resolveReminderNotificationAction(reminder, 0, now)).toEqual({ type: 'dismiss' });
  });

  it('Done dismisses a paused recurring reminder', () => {
    const reminder = { ...base, recurring: { frequency: 'daily' as const }, paused: true };
    expect(resolveReminderNotificationAction(reminder, 0, now)).toEqual({ type: 'dismiss' });
  });

  it('Snooze reschedules an active recurring reminder to now + 5 min', () => {
    const reminder = { ...base, recurring: { frequency: 'daily' as const } };
    expect(resolveReminderNotificationAction(reminder, 1, now)).toEqual({
      type: 'snooze',
      dueDate: expectedSnoozeDueDate,
    });
  });

  it('Snooze reschedules a one-off reminder to now + 5 min', () => {
    const reminder = { ...base, recurring: undefined };
    expect(resolveReminderNotificationAction(reminder, 1, now)).toEqual({
      type: 'snooze',
      dueDate: expectedSnoozeDueDate,
    });
  });

  it('Snooze dismisses a paused recurring reminder', () => {
    const reminder = { ...base, recurring: { frequency: 'daily' as const }, paused: true };
    expect(resolveReminderNotificationAction(reminder, 1, now)).toEqual({ type: 'dismiss' });
  });

  it('dismisses an undefined reminder', () => {
    expect(resolveReminderNotificationAction(undefined, 0, now)).toEqual({ type: 'dismiss' });
  });

  it('dismisses an unknown button index', () => {
    const reminder = { ...base, recurring: undefined };
    expect(resolveReminderNotificationAction(reminder, 2, now)).toEqual({ type: 'dismiss' });
  });
});
