import type { Goal, PostureDailyStat, Quote } from '@cuewise/shared';
import * as shared from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { goalFactory, pomodoroFactory, quoteFactory } from '@cuewise/test-utils/factories';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fileUtils from '../utils/file-utils';
import {
  createQuotaError,
  createTestDataWithDuplicates,
  createValidImportValidation,
  DEFAULT_IMPORT_OPTIONS,
  mockEmptyStorage,
  mockStorageError,
  mockStorageWithData,
  QUARANTINED_GOAL,
  QUARANTINED_QUOTE,
  QUARANTINED_SESSION,
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
  // Import and export read raw: the merge and the backup rewrite whole arrays, so starting
  // from the rendering view would delete items it merely could not parse.
  getGoalsRaw: vi.fn(),
  getQuotesRaw: vi.fn(),
  getPomodoroSessionsRaw: vi.fn(),
  // Import merges into the raw array, so it writes raw: it saw everything, and a
  // preserve-on-write would resurrect what it deliberately left out.
  setGoalsRaw: vi.fn(),
  setQuotesRaw: vi.fn(),
  setPomodoroSessionsRaw: vi.fn(),
  // Defaults to empty so refresh-after-import paths don't error on posture reads.
  getPostureStats: vi.fn(async () => []),
  setPostureStats: vi.fn(),
}));

vi.mock('../utils/file-utils', () => ({
  readFileAsText: vi.fn(),
}));

vi.mock('@cuewise/shared', async () => {
  const actual = await vi.importActual('@cuewise/shared');
  return { ...actual, parseImportData: vi.fn() };
});

// Mock toast store with module-level fns so each level is inspectable across getState() calls.
const toastError = vi.fn();
const toastWarning = vi.fn();
const toastSuccess = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: toastError, warning: toastWarning, success: toastSuccess }),
  },
}));

// ============================================================================
// Tests
// ============================================================================

const originalCreateElement = document.createElement.bind(document);

/**
 * The Blob the export actually produced. Both export paths catch everything after the reads,
 * so an emptied payload keeps every reader assertion green.
 */
function captureDownloadedBlob(): () => Blob {
  let captured: Blob | undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    captured = blob as Blob;
    return 'blob:x';
  });
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    Object.assign(originalCreateElement(tag), { click: () => undefined })
  );
  return () => {
    if (captured === undefined) {
      throw new Error('no Blob was handed to URL.createObjectURL');
    }
    return captured;
  };
}

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
      postureSummary: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  // `clearAllMocks` keeps implementations and this package sets no `restoreMocks`, so the
  // export tests' `createElement` spy would outlive them. No test needs this yet.
  afterEach(() => {
    vi.restoreAllMocks();
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

    // Import rewrites the whole array, so a validated read drops what it cannot parse — and
    // their ids are then absent from the dedupe set, so incoming copies replace them.
    it('keeps a stored goal only the raw read can see', async () => {
      mockStorageWithData({ goals: [goalFactory.build({ id: 'existing-1' })] });
      useInsightsStore.setState({
        importValidation: createValidImportValidation({
          goals: [goalFactory.build({ id: 'new-1' })],
          quotes: [quoteFactory.build({ id: 'new-q' })],
          pomodoroSessions: [pomodoroFactory.build({ id: 'new-s' })],
        }),
      });

      await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      const saved = vi.mocked(storage.setGoalsRaw).mock.calls[0][0] as Goal[];
      expect(saved.map((goal) => goal.id)).toContain(QUARANTINED_GOAL.id);
      const savedQuotes = vi.mocked(storage.setQuotesRaw).mock.calls[0][0] as Quote[];
      expect(savedQuotes.map((quote) => quote.id)).toContain(QUARANTINED_QUOTE.id);
      const savedSessions = vi.mocked(storage.setPomodoroSessionsRaw).mock.calls[0][0];
      expect(savedSessions.map((session) => session.id)).toContain(QUARANTINED_SESSION.id);
    });

    // The backup's whole contract is faithfulness, and it was only ever mocked, never run.
    it('exports every stored item, including the ones this build cannot render', async () => {
      mockStorageWithData({ goals: [goalFactory.build({ id: 'g1' })] });
      const written = captureDownloadedBlob();

      await useInsightsStore.getState().exportAllAsJSON();

      // The payload, not just which readers ran: three empty arrays satisfied those.
      const payload = JSON.parse(await written().text());
      expect(payload.goals.map((goal: Goal) => goal.id)).toContain(QUARANTINED_GOAL.id);
      expect(payload.quotes.map((quote: Quote) => quote.id)).toContain(QUARANTINED_QUOTE.id);
      expect(payload.pomodoroSessions.map((s: { id: string }) => s.id)).toContain(
        QUARANTINED_SESSION.id
      );
      // The raw readers, not the rendering ones: a backup that omits what this build cannot
      // parse is not a backup, and re-importing it writes the reduced set over storage.
      expect(vi.mocked(storage.getGoals)).not.toHaveBeenCalled();
    });

    // CSV shares the export contract and had the same gap — its raw reads were revertible.
    // Both types, because they read through different helpers and only one was covered.
    it.each([
      ['goals', 'goals', QUARANTINED_GOAL.id],
      ['pomodoros', 'pomodoros', QUARANTINED_SESSION.id],
    ] as const)('exports the same hidden items to the %s CSV', async (_label, type, hiddenId) => {
      mockStorageWithData({ goals: [goalFactory.build({ id: 'g1' })] });
      const written = captureDownloadedBlob();

      await useInsightsStore.getState().exportAsCSV(type);

      expect(await written().text()).toContain(hiddenId);
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

      const savedGoals = vi.mocked(storage.setGoalsRaw).mock.calls[0][0] as Goal[];
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
      const savedGoals = vi.mocked(storage.setGoalsRaw).mock.calls[0][0] as Goal[];
      // By id: the saved array also carries the quarantined row, so position pins ordering.
      expect(savedGoals.find((goal) => goal.id === 'existing-1')?.text).toBe('Updated');
    });

    it('should mark all imported quotes as isCustom: true', async () => {
      const importQuote = quoteFactory.build({ isCustom: false });

      mockStorageWithData();
      useInsightsStore.setState({
        importValidation: createValidImportValidation({ quotes: [importQuote] }),
      });

      await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      const savedQuotes = vi.mocked(storage.setQuotesRaw).mock.calls[0][0] as Quote[];
      // By id: the saved array leads with the quarantined row, which is already isCustom.
      expect(savedQuotes.find((quote) => quote.id === importQuote.id)?.isCustom).toBe(true);
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

    it('surfaces a resolved write failure instead of a phantom success', async () => {
      mockStorageWithData();
      // The real quota shape: adapters resolve {success: false}, never reject.
      vi.mocked(storage.setGoalsRaw).mockResolvedValue({
        success: false,
        error: { type: 'quota_exceeded', message: 'goals quota exceeded' },
      });
      useInsightsStore.setState({
        importValidation: createValidImportValidation({ goals: [goalFactory.build()] }),
      });

      const result = await useInsightsStore.getState().executeImport(DEFAULT_IMPORT_OPTIONS);

      expect(result.success).toBe(false);
      expect(result.imported.goals).toBe(0);
      expect(toastSuccess).not.toHaveBeenCalled();
      expect(useInsightsStore.getState().error).toBe(
        'Storage space is full. Please clear some data and try again.'
      );
    });

    it('reports partial progress when a later write resolves a failure', async () => {
      mockStorageWithData();
      vi.mocked(storage.setQuotesRaw).mockResolvedValue({
        success: false,
        error: { type: 'unknown', message: 'write failed' },
      });
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

    it('should report partial progress when failure occurs mid-import', async () => {
      vi.mocked(storage.getGoalsRaw).mockResolvedValue([]);
      vi.mocked(storage.setGoalsRaw).mockResolvedValue({ success: true });
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

describe('Insights Store - posture summary wiring', () => {
  beforeEach(() => {
    useInsightsStore.setState({ postureSummary: null, insights: null, error: null });
    vi.clearAllMocks();
  });

  it('initialize computes the summary when posture stats exist', async () => {
    const today = shared.getTodayDateString();
    mockStorageWithData({
      postureStats: [{ date: today, counts: { good: 60, mild: 20, poor: 20, absent: 0 } }],
    });

    await useInsightsStore.getState().initialize();

    expect(useInsightsStore.getState().postureSummary).toMatchObject({ todayPercent: 80 });
  });

  it('initialize leaves the summary null when nothing was tracked (extension)', async () => {
    mockStorageWithData();

    await useInsightsStore.getState().initialize();

    expect(useInsightsStore.getState().postureSummary).toBeNull();
    expect(useInsightsStore.getState().error).toBeNull();
  });

  it('heals a version-skewed blob on read instead of surfacing NaN', async () => {
    const today = shared.getTodayDateString();
    const skewed = [{ date: today, counts: { good: 5 } }] as unknown as PostureDailyStat[];
    mockStorageWithData({ postureStats: skewed });

    await useInsightsStore.getState().initialize();

    expect(useInsightsStore.getState().postureSummary).toMatchObject({ todayPercent: 100 });
  });

  it('refresh recomputes the summary from freshly loaded stats', async () => {
    const today = shared.getTodayDateString();
    mockStorageWithData({
      postureStats: [{ date: today, counts: { good: 50, mild: 0, poor: 50, absent: 0 } }],
    });

    await useInsightsStore.getState().refresh();

    expect(useInsightsStore.getState().postureSummary).toMatchObject({ todayPercent: 50 });
  });
});
