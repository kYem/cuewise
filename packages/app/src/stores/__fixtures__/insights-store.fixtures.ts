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

/** Stands in for a stored goal only the raw read can see. */
export const QUARANTINED_GOAL = {
  id: 'quarantined-goal',
  text: 'written by a newer build',
  completed: false,
  createdAt: '2026-07-26T00:00:00.000Z',
  date: '2026-07-26',
} as ReturnType<typeof goalFactory.build>;

/** Stands in for a stored quote only the raw read can see. */
export const QUARANTINED_QUOTE = {
  id: 'quarantined-quote',
  text: 'written by a newer build',
  isCustom: true,
} as ReturnType<typeof quoteFactory.build>;

/** Stands in for a stored session only the raw read can see. */
export const QUARANTINED_SESSION = {
  id: 'quarantined-session',
  startedAt: '2026-07-26T00:00:00.000Z',
} as ReturnType<typeof pomodoroFactory.build>;

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
  // view would delete items it merely could not parse.
  //
  // The raw goals mock returns one row MORE than the validated one, standing in for an item
  // only a raw read can see. Returning identical arrays made the two readers
  // indistinguishable, so swapping a raw read for a validated one passed every test.
  vi.mocked(storage.getGoalsRaw).mockResolvedValue([...(options.goals ?? []), QUARANTINED_GOAL]);
  vi.mocked(storage.getQuotesRaw).mockResolvedValue([...(options.quotes ?? []), QUARANTINED_QUOTE]);
  vi.mocked(storage.getPomodoroSessionsRaw).mockResolvedValue([
    ...(options.sessions ?? []),
    QUARANTINED_SESSION,
  ]);
  vi.mocked(storage.setGoalsRaw).mockResolvedValue({ success: true });
  vi.mocked(storage.setQuotesRaw).mockResolvedValue({ success: true });
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
