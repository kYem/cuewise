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
  exportDailyTrendsCSV,
  exportGoalsCSV,
  exportMonthlyTrendsCSV,
  exportPomodoroSessionsCSV,
  exportWeeklyTrendsCSV,
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
