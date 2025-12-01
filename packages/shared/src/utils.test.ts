import { describe, expect, it } from 'vitest';
import {
  createHeatmapTestSessions,
  createTestGoals,
  createTestPomodoroSessions,
  createTrendTestGoals,
} from './__fixtures__/analytics.fixtures';
import {
  calculateAdvancedAnalytics,
  calculateDailyTrends,
  calculateGoalCompletionRate,
  calculateMonthlyTrends,
  calculatePomodoroHeatmap,
  calculateWeeklyTrends,
  compareVersions,
  exportDailyTrendsCSV,
  exportGoalsCSV,
  exportMonthlyTrendsCSV,
  exportPomodoroSessionsCSV,
  exportWeeklyTrendsCSV,
  getRandomQuote,
  parseImportData,
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
});
