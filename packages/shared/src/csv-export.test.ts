import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createTestGoals,
  createTestPomodoroSessions,
  createTrendTestGoals,
} from './__fixtures__/analytics.fixtures';
import { calculateDailyTrends, calculateMonthlyTrends, calculateWeeklyTrends } from './analytics';
import {
  exportDailyTrendsCSV,
  exportGoalsCSV,
  exportMonthlyTrendsCSV,
  exportPomodoroSessionsCSV,
  exportWeeklyTrendsCSV,
} from './csv-export';

// The fixtures build goals/sessions relative to "now"; on a Monday, "yesterday" falls outside
// the this-week window and the weekly assertions flake. Freeze time to a mid-week, mid-month day.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-08T12:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
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
