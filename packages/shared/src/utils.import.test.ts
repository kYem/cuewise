import { describe, expect, it } from 'vitest';
import { compareVersions, parseImportData } from './utils';

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
});
