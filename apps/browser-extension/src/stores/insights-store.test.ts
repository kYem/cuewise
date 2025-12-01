import type { Goal, Quote } from '@cuewise/shared';
import * as shared from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { goalFactory, pomodoroFactory, quoteFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fileUtils from '../utils/file-utils';
import {
  createQuotaError,
  createTestDataWithDuplicates,
  createValidImportValidation,
  DEFAULT_IMPORT_OPTIONS,
  mockEmptyStorage,
  mockStorageError,
  mockStorageWithData,
} from './__fixtures__/insights-store.fixtures';
import { useInsightsStore } from './insights-store';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@cuewise/storage', () => ({
  getGoals: vi.fn(),
  setGoals: vi.fn(),
  getQuotes: vi.fn(),
  setQuotes: vi.fn(),
  getPomodoroSessions: vi.fn(),
  setPomodoroSessions: vi.fn(),
}));

vi.mock('../utils/file-utils', () => ({
  readFileAsText: vi.fn(),
}));

vi.mock('@cuewise/shared', async () => {
  const actual = await vi.importActual('@cuewise/shared');
  return { ...actual, parseImportData: vi.fn() };
});

vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }),
  },
}));

// ============================================================================
// Tests
// ============================================================================

describe('Insights Store - Import Methods', () => {
  beforeEach(() => {
    useInsightsStore.setState({
      importValidation: null,
      isImporting: false,
      quotes: [],
      goals: [],
      pomodoroSessions: [],
      insights: null,
      analytics: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe('validateImportFile', () => {
    it('should set importValidation state on successful validation', async () => {
      const mockFile = new File(['{}'], 'test.json', { type: 'application/json' });
      const mockValidation = createValidImportValidation();

      vi.mocked(fileUtils.readFileAsText).mockResolvedValue('{}');
      vi.mocked(shared.parseImportData).mockReturnValue(mockValidation);

      const result = await useInsightsStore.getState().validateImportFile(mockFile);

      expect(result).toEqual(mockValidation);
      expect(useInsightsStore.getState().importValidation).toEqual(mockValidation);
    });

    it('should handle file read errors and preserve error message', async () => {
      const mockFile = new File([''], 'test.json', { type: 'application/json' });
      const errorMessage = 'File too large (15MB). Maximum size is 10MB.';

      vi.mocked(fileUtils.readFileAsText).mockRejectedValue(new Error(errorMessage));

      const result = await useInsightsStore.getState().validateImportFile(mockFile);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].message).toBe(errorMessage);
    });
  });

  describe('executeImport', () => {
    it('should return error when no valid import data available', async () => {
      const result = await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      expect(result.success).toBe(false);
      expect(result.errors[0].message).toBe('No valid import data available');
    });

    it('should skip duplicate goals when skipDuplicates is true', async () => {
      const existingGoal = goalFactory.build({ id: 'existing-1' });
      const newGoal = goalFactory.build({ id: 'new-1' });
      const duplicateGoal = goalFactory.build({ id: 'existing-1', text: 'Updated' });

      mockStorageWithData({ goals: [existingGoal] });
      useInsightsStore.setState({
        importValidation: createValidImportValidation({ goals: [duplicateGoal, newGoal] }),
      });

      const result = await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      expect(result.imported.goals).toBe(1);
      expect(result.skipped.goals).toBe(1);

      const savedGoals = vi.mocked(storage.setGoals).mock.calls[0][0] as Goal[];
      expect(savedGoals.find((g) => g.id === 'existing-1')?.text).toBe(existingGoal.text);
    });

    it('should replace existing goals when skipDuplicates is false', async () => {
      const existingGoal = goalFactory.build({ id: 'existing-1', text: 'Original' });
      const importGoal = goalFactory.build({ id: 'existing-1', text: 'Updated' });

      mockStorageWithData({ goals: [existingGoal] });
      useInsightsStore.setState({
        importValidation: createValidImportValidation({ goals: [importGoal] }),
      });

      const result = await useInsightsStore.getState().executeImport({
        ...DEFAULT_IMPORT_OPTIONS,
        skipDuplicates: false,
      });

      expect(result.imported.goals).toBe(1);
      const savedGoals = vi.mocked(storage.setGoals).mock.calls[0][0] as Goal[];
      expect(savedGoals[0].text).toBe('Updated');
    });

    it('should mark all imported quotes as isCustom: true', async () => {
      const importQuote = quoteFactory.build({ isCustom: false });

      mockStorageWithData();
      useInsightsStore.setState({
        importValidation: createValidImportValidation({ quotes: [importQuote] }),
      });

      await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      const savedQuotes = vi.mocked(storage.setQuotes).mock.calls[0][0] as Quote[];
      expect(savedQuotes[0].isCustom).toBe(true);
    });

    it('should return correct counts for imported and skipped items', async () => {
      const { existing, new: newItems } = createTestDataWithDuplicates();

      mockStorageWithData({
        goals: [existing.goal],
        quotes: [existing.quote],
        sessions: [existing.session],
      });
      useInsightsStore.setState({
        importValidation: createValidImportValidation({
          goals: [existing.goal, newItems.goal],
          quotes: [existing.quote, newItems.quote],
          pomodoroSessions: [existing.session, newItems.session],
        }),
      });

      const result = await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      expect(result.success).toBe(true);
      expect(result.imported).toEqual({ goals: 1, quotes: 1, pomodoroSessions: 1 });
      expect(result.skipped).toEqual({ goals: 1, quotes: 1, pomodoroSessions: 1 });
    });

    it('should reset isImporting flag on success', async () => {
      mockEmptyStorage();
      useInsightsStore.setState({
        importValidation: createValidImportValidation(),
        isImporting: true,
      });

      await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      expect(useInsightsStore.getState().isImporting).toBe(false);
    });

    it('should reset isImporting flag on failure', async () => {
      mockStorageError('goals', new Error('Storage error'));
      useInsightsStore.setState({
        importValidation: createValidImportValidation({ goals: [goalFactory.build()] }),
        isImporting: true,
      });

      const result = await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      expect(result.success).toBe(false);
      expect(useInsightsStore.getState().isImporting).toBe(false);
    });

    it('should show storage full message when quota is exceeded', async () => {
      mockStorageError('goals', createQuotaError());
      useInsightsStore.setState({
        importValidation: createValidImportValidation({ goals: [goalFactory.build()] }),
      });

      const result = await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      expect(result.success).toBe(false);
      expect(useInsightsStore.getState().error).toBe(
        'Storage space is full. Please clear some data and try again.'
      );
    });

    it('should report partial progress when failure occurs mid-import', async () => {
      vi.mocked(storage.getGoals).mockResolvedValue([]);
      vi.mocked(storage.setGoals).mockResolvedValue(true);
      mockStorageError('quotes', new Error('Quotes storage error'));

      useInsightsStore.setState({
        importValidation: createValidImportValidation({
          goals: [goalFactory.build()],
          quotes: [quoteFactory.build()],
        }),
      });

      const result = await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      expect(result.success).toBe(false);
      expect(result.imported.goals).toBe(1);
      expect(result.imported.quotes).toBe(0);
    });

    it('should set error state on failure', async () => {
      mockStorageError('goals', new Error('Storage error'));
      useInsightsStore.setState({
        importValidation: createValidImportValidation({ goals: [goalFactory.build()] }),
      });

      await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      expect(useInsightsStore.getState().error).toBe('Failed to import data. Please try again.');
    });

    it('should clear importValidation on success', async () => {
      mockEmptyStorage();
      useInsightsStore.setState({ importValidation: createValidImportValidation() });

      await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      expect(useInsightsStore.getState().importValidation).toBeNull();
    });

    it('should not import when option is disabled', async () => {
      mockEmptyStorage();
      useInsightsStore.setState({
        importValidation: createValidImportValidation({
          goals: [goalFactory.build()],
          quotes: [quoteFactory.build()],
          pomodoroSessions: [pomodoroFactory.build()],
        }),
      });

      const result = await useInsightsStore.getState().executeImport({
        importGoals: false,
        importQuotes: false,
        importPomodoroSessions: false,
        skipDuplicates: true,
      });

      expect(result.success).toBe(true);
      expect(result.imported).toEqual({ goals: 0, quotes: 0, pomodoroSessions: 0 });
      expect(storage.setGoals).not.toHaveBeenCalled();
      expect(storage.setQuotes).not.toHaveBeenCalled();
      expect(storage.setPomodoroSessions).not.toHaveBeenCalled();
    });
  });

  describe('clearImportValidation', () => {
    it('should reset importValidation and isImporting state', () => {
      useInsightsStore.setState({
        importValidation: createValidImportValidation(),
        isImporting: true,
      });

      useInsightsStore.getState().clearImportValidation();

      expect(useInsightsStore.getState().importValidation).toBeNull();
      expect(useInsightsStore.getState().isImporting).toBe(false);
    });
  });
});
