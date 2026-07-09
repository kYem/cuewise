import type { ImportResult, ImportValidation } from '@cuewise/shared';
import { vi } from 'vitest';

// Canonical options live with the insights-store fixtures; re-export so both test suites share one source.
export { DEFAULT_IMPORT_OPTIONS } from '../../stores/__fixtures__/insights-store.fixtures';

/**
 * Creates a valid ImportValidation object for testing.
 *
 * Diverges from the insights-store fixture's same-named helper: this one ships
 * populated sample goal/quote/session data and takes ImportValidation overrides,
 * which the ImportControls render tests assert on. Not consolidated for that reason.
 */
export function createValidImportValidation(
  overrides?: Partial<ImportValidation>
): ImportValidation {
  return {
    isValid: true,
    errors: [],
    warnings: [],
    data: {
      version: '1.0.0',
      formatVersion: 1,
      exportDate: new Date().toISOString(),
      insights: null,
      analytics: null,
      goals: [
        {
          id: 'goal-1',
          text: 'Test goal',
          completed: false,
          createdAt: new Date().toISOString(),
          date: '2025-01-15',
        },
      ],
      quotes: [
        {
          id: 'quote-1',
          text: 'Test quote',
          author: 'Author',
          category: 'inspiration',
          isCustom: true,
          isFavorite: false,
          isHidden: false,
          viewCount: 0,
        },
      ],
      pomodoroSessions: [
        {
          id: 'session-1',
          startedAt: new Date().toISOString(),
          duration: 25,
          type: 'work',
          interrupted: false,
        },
      ],
    },
    ...overrides,
  };
}

/**
 * Creates an invalid ImportValidation object for testing
 */
export function createInvalidImportValidation(
  errors = [{ field: 'json', message: 'Invalid JSON format' }]
): ImportValidation {
  return {
    isValid: false,
    errors,
    warnings: [],
    data: null,
  };
}

/**
 * Creates a validation with warnings
 */
export function createValidationWithWarnings(warnings: string[]): ImportValidation {
  const validation = createValidImportValidation();
  validation.warnings = warnings;
  return validation;
}

/**
 * Creates a successful ImportResult
 */
export function createSuccessfulImportResult(): ImportResult {
  return {
    success: true,
    imported: { goals: 1, quotes: 1, pomodoroSessions: 1 },
    skipped: { goals: 0, quotes: 0, pomodoroSessions: 0 },
    errors: [],
  };
}

/**
 * Creates default props for ImportControls component
 */
export function createDefaultProps() {
  return {
    importValidation: null as ImportValidation | null,
    isImporting: false,
    onValidateFile: vi.fn(),
    onExecuteImport: vi.fn().mockResolvedValue(createSuccessfulImportResult()),
    onClearValidation: vi.fn(),
  };
}
