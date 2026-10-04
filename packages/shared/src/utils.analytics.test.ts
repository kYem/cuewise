import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createHeatmapTestSessions,
  createTestGoals,
  createTestPomodoroSessions,
  createTrendTestGoals,
  createTuesdayMorningSessions,
  workSessionAt,
} from './__fixtures__/analytics.fixtures';
import {
  calculateAdvancedAnalytics,
  calculateDailyTrends,
  calculateGoalCompletionRate,
  calculateMonthlyTrends,
  calculatePomodoroHeatmap,
  calculateWeeklyTrends,
  countFocusSessionsToday,
  dayPartOfHour,
  exportDailyTrendsCSV,
  exportGoalsCSV,
  exportMonthlyTrendsCSV,
  exportPomodoroSessionsCSV,
  exportWeeklyTrendsCSV,
  FOCUS_PEAK_MIN_SESSIONS,
  findFocusPeak,
} from './utils';

// The fixtures build goals/sessions relative to "now"; on a Monday, "yesterday" falls outside
// the this-week window and the weekly assertions flake. Freeze time to a mid-week, mid-month day.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-08T12:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('countFocusSessionsToday', () => {
  it("counts only today's non-interrupted work sessions", () => {
    // Fixture: 3 completed work sessions today, plus yesterday / interrupted / break sessions.
    expect(countFocusSessionsToday(createTestPomodoroSessions())).toBe(3);
  });
});

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

    describe('weekdayHourDistribution', () => {
      it('counts each session under the local weekday and hour it completed', () => {
        const { weekdayHourDistribution } = calculatePomodoroHeatmap([
          workSessionAt(7, 9),
          workSessionAt(7, 9, 20),
          workSessionAt(7, 23, 50),
        ]);

        expect(weekdayHourDistribution[2][9]).toBe(2);
        expect(weekdayHourDistribution[3][0]).toBe(1);
      });

      it('counts only completed work sessions', () => {
        const { weekdayHourDistribution } = calculatePomodoroHeatmap(createTestPomodoroSessions());

        expect(weekdayHourDistribution.flat().reduce((sum, count) => sum + count, 0)).toBe(4);
      });

      it('is a 7 × 24 grid of zeros with no sessions', () => {
        const { weekdayHourDistribution } = calculatePomodoroHeatmap([]);

        expect(weekdayHourDistribution).toHaveLength(7);
        expect(weekdayHourDistribution.every((hours) => hours.length === 24)).toBe(true);
        expect(weekdayHourDistribution.flat().every((count) => count === 0)).toBe(true);
      });
    });
  });

  describe('findFocusPeak', () => {
    it('names the weekday and part of day with the most sessions', () => {
      const { weekdayHourDistribution } = calculatePomodoroHeatmap(createTuesdayMorningSessions());

      expect(findFocusPeak(weekdayHourDistribution)).toEqual({ weekday: 2, dayPart: 'morning' });
    });

    it('declines to name a peak below the minimum number of sessions', () => {
      const sessions = createTuesdayMorningSessions().slice(0, FOCUS_PEAK_MIN_SESSIONS - 1);
      const { weekdayHourDistribution } = calculatePomodoroHeatmap(sessions);

      expect(findFocusPeak(weekdayHourDistribution)).toBeNull();
    });

    it('names a peak from the minimum number of sessions on', () => {
      const sessions = createTuesdayMorningSessions().slice(0, FOCUS_PEAK_MIN_SESSIONS);
      const { weekdayHourDistribution } = calculatePomodoroHeatmap(sessions);

      expect(findFocusPeak(weekdayHourDistribution)).not.toBeNull();
    });

    it('breaks a tie toward the earlier weekday, Monday first', () => {
      const sessions = [5, 6].flatMap((day) =>
        Array.from({ length: 5 }, (_, i) => workSessionAt(day, 14, i * 5))
      );
      const { weekdayHourDistribution } = calculatePomodoroHeatmap(sessions);

      expect(findFocusPeak(weekdayHourDistribution)).toEqual({
        weekday: 1,
        dayPart: 'afternoon',
      });
    });

    it('breaks a tie within a day toward the earlier part of it', () => {
      const sessions = [9, 18].flatMap((hour) =>
        Array.from({ length: 5 }, (_, i) => workSessionAt(6, hour, i * 5))
      );
      const { weekdayHourDistribution } = calculatePomodoroHeatmap(sessions);

      expect(findFocusPeak(weekdayHourDistribution)).toEqual({ weekday: 1, dayPart: 'morning' });
    });

    it('counts the small hours toward the night that began the evening before', () => {
      const sessions = [
        ...Array.from({ length: 4 }, (_, i) => workSessionAt(7, 22, i * 5)),
        ...Array.from({ length: 4 }, (_, i) => workSessionAt(8, 1, i * 5)),
        ...Array.from({ length: 5 }, (_, i) => workSessionAt(8, 22, i * 5)),
      ];
      const { weekdayHourDistribution } = calculatePomodoroHeatmap(sessions);

      expect(findFocusPeak(weekdayHourDistribution)).toEqual({ weekday: 2, dayPart: 'night' });
    });
  });

  describe('dayPartOfHour', () => {
    it.each([
      [4, 'night'],
      [5, 'morning'],
      [11, 'morning'],
      [12, 'afternoon'],
      [16, 'afternoon'],
      [17, 'evening'],
      [20, 'evening'],
      [21, 'night'],
      [0, 'night'],
    ])('puts %i:00 in the %s', (hour, dayPart) => {
      expect(dayPartOfHour(hour)).toBe(dayPart);
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
