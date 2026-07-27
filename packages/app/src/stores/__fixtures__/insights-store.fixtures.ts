import type { ExportData, ImportOptions, PostureDailyStat } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { goalFactory, pomodoroFactory, quoteFactory } from '@cuewise/test-utils/factories';
import { vi } from 'vitest';

// ============================================================================
// Default Options
// ============================================================================

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  importGoals: true,
  importQuotes: true,
  importPomodoroSessions: true,
  skipDuplicates: true,
};

// ============================================================================
// Import Validation Builders
// ============================================================================

export function createValidImportValidation(data: Partial<ExportData> = {}) {
  const defaultData: ExportData = {
    version: '1.0.0',
    formatVersion: 1,
    exportDate: new Date().toISOString(),
    insights: null,
    analytics: null,
    goals: [],
    quotes: [],
    pomodoroSessions: [],
    ...data,
  };

  return {
    isValid: true,
    errors: [],
    warnings: [],
    data: defaultData,
  };
}

// ============================================================================
// Storage Mock Helpers
// ============================================================================

export function mockEmptyStorage() {
  vi.mocked(storage.getGoals).mockResolvedValue([]);
  vi.mocked(storage.getQuotes).mockResolvedValue([]);
  vi.mocked(storage.getPomodoroSessions).mockResolvedValue([]);
  vi.mocked(storage.getPostureStats).mockResolvedValue([]);
}

export function mockStorageWithData(
  options: {
    goals?: ReturnType<typeof goalFactory.build>[];
    quotes?: ReturnType<typeof quoteFactory.build>[];
    sessions?: ReturnType<typeof pomodoroFactory.build>[];
    postureStats?: PostureDailyStat[];
  } = {}
) {
  vi.mocked(storage.getGoals).mockResolvedValue(options.goals ?? []);
  vi.mocked(storage.setGoalsRaw).mockResolvedValue({ success: true });
  vi.mocked(storage.getQuotes).mockResolvedValue(options.quotes ?? []);
  vi.mocked(storage.setQuotesRaw).mockResolvedValue({ success: true });
  vi.mocked(storage.getPomodoroSessions).mockResolvedValue(options.sessions ?? []);
  // Import and export read raw — they rewrite whole arrays, so starting from the rendering
  // view would delete items it merely could not parse. Same data here; the distinction is
  // exercised by the storage package's own tests.
  vi.mocked(storage.getGoalsRaw).mockResolvedValue(options.goals ?? []);
  vi.mocked(storage.getQuotesRaw).mockResolvedValue(options.quotes ?? []);
  vi.mocked(storage.getPomodoroSessionsRaw).mockResolvedValue(options.sessions ?? []);
  vi.mocked(storage.setGoalsRaw).mockResolvedValue({ success: true });
  vi.mocked(storage.setQuotesRaw).mockResolvedValue({ success: true });
  vi.mocked(storage.setPomodoroSessionsRaw).mockResolvedValue({ success: true });
  vi.mocked(storage.setPomodoroSessionsRaw).mockResolvedValue({ success: true });
  vi.mocked(storage.getPostureStats).mockResolvedValue(options.postureStats ?? []);
}

/** Both readers fail together: import reads raw, the refresh that follows reads validated. */
export function mockStorageError(operation: 'goals' | 'quotes' | 'sessions', error: Error) {
  if (operation === 'goals') {
    vi.mocked(storage.getGoals).mockRejectedValue(error);
    vi.mocked(storage.getGoalsRaw).mockRejectedValue(error);
  } else if (operation === 'quotes') {
    vi.mocked(storage.getQuotes).mockRejectedValue(error);
    vi.mocked(storage.getQuotesRaw).mockRejectedValue(error);
  } else {
    vi.mocked(storage.getPomodoroSessions).mockRejectedValue(error);
    vi.mocked(storage.getPomodoroSessionsRaw).mockRejectedValue(error);
  }
}

// ============================================================================
// Error Helpers
// ============================================================================

export function createQuotaError() {
  const error = new Error('QuotaExceededError');
  error.name = 'QuotaExceededError';
  return error;
}

// ============================================================================
// Test Data Builders
// ============================================================================

export function createTestDataWithDuplicates() {
  const existingGoal = goalFactory.build({ id: 'existing-goal' });
  const existingQuote = quoteFactory.build({ id: 'existing-quote' });
  const existingSession = pomodoroFactory.build({ id: 'existing-session' });

  const newGoal = goalFactory.build();
  const newQuote = quoteFactory.build();
  const newSession = pomodoroFactory.build();

  return {
    existing: { goal: existingGoal, quote: existingQuote, session: existingSession },
    new: { goal: newGoal, quote: newQuote, session: newSession },
  };
}
