import type { ExportData, ImportOptions } from '@cuewise/shared';
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

export function createInvalidImportValidation(errorMessage = 'Validation failed') {
  return {
    isValid: false,
    errors: [{ field: 'file', message: errorMessage }],
    warnings: [],
    data: null,
  };
}

// ============================================================================
// Storage Mock Helpers
// ============================================================================

export function mockEmptyStorage() {
  vi.mocked(storage.getGoals).mockResolvedValue([]);
  vi.mocked(storage.getQuotes).mockResolvedValue([]);
  vi.mocked(storage.getPomodoroSessions).mockResolvedValue([]);
}

export function mockStorageWithData(
  options: {
    goals?: ReturnType<typeof goalFactory.build>[];
    quotes?: ReturnType<typeof quoteFactory.build>[];
    sessions?: ReturnType<typeof pomodoroFactory.build>[];
  } = {}
) {
  vi.mocked(storage.getGoals).mockResolvedValue(options.goals ?? []);
  vi.mocked(storage.setGoals).mockResolvedValue(true);
  vi.mocked(storage.getQuotes).mockResolvedValue(options.quotes ?? []);
  vi.mocked(storage.setQuotes).mockResolvedValue(true);
  vi.mocked(storage.getPomodoroSessions).mockResolvedValue(options.sessions ?? []);
  vi.mocked(storage.setPomodoroSessions).mockResolvedValue(true);
}

export function mockStorageError(operation: 'goals' | 'quotes' | 'sessions', error: Error) {
  if (operation === 'goals') {
    vi.mocked(storage.getGoals).mockRejectedValue(error);
  } else if (operation === 'quotes') {
    vi.mocked(storage.getQuotes).mockRejectedValue(error);
  } else {
    vi.mocked(storage.getPomodoroSessions).mockRejectedValue(error);
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
