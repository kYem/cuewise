import { getTodayDateString } from './date-utils';
import {
  goalSchema,
  pomodoroSessionSchema,
  quoteCategorySchema,
  quoteSchema,
  subtaskSchema,
} from './schemas';
import type {
  ExportData,
  Goal,
  ImportValidationError,
  PomodoroSession,
  Quote,
  Subtask,
} from './types';
import { EXPORT_FORMAT_VERSION } from './types';

// ============================================================================
// Import utilities
// ============================================================================

/**
 * Validation result for import data
 */
export interface ImportValidation {
  isValid: boolean;
  errors: ImportValidationError[];
  warnings: string[];
  data: ExportData | null;
}

/**
 * Parse and validate import data from JSON string.
 * Performs JSON parsing, schema validation, and format version compatibility checks.
 *
 * @param jsonString - Raw JSON string from imported file
 * @returns ImportValidation containing validation status, errors, warnings, and parsed data
 *
 * @remarks
 * - Legacy exports without formatVersion are allowed with a warning
 * - Missing arrays (goals, quotes, pomodoroSessions) are initialized to empty with warnings
 * - Individual items in arrays are validated and invalid items are reported as errors
 * - Validation fails if formatVersion exceeds EXPORT_FORMAT_VERSION (forward compatibility)
 */
export function parseImportData(jsonString: string): ImportValidation {
  const errors: ImportValidationError[] = [];
  const warnings: string[] = [];

  // Try to parse JSON
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return {
      isValid: false,
      errors: [{ field: 'json', message: 'Invalid JSON format' }],
      warnings: [],
      data: null,
    };
  }

  // Check if it's an object
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      isValid: false,
      errors: [{ field: 'root', message: 'Export data must be an object' }],
      warnings: [],
      data: null,
    };
  }

  const exportData = data as Record<string, unknown>;

  // Check format version for compatibility
  if (exportData.formatVersion !== undefined) {
    const formatVersion = exportData.formatVersion as number;
    if (formatVersion > EXPORT_FORMAT_VERSION) {
      errors.push({
        field: 'formatVersion',
        message: `Export format version ${formatVersion} is newer than supported version ${EXPORT_FORMAT_VERSION}. Please update Cuewise to import this file.`,
      });
    }
  } else {
    // Legacy export without format version - add warning but allow import
    warnings.push(
      'This export file does not have a format version. It may be from an older version of Cuewise.'
    );
  }

  // Check for required arrays (can be empty but must exist)
  if (!Array.isArray(exportData.goals)) {
    exportData.goals = [];
    warnings.push('No goals found in export file');
  }

  if (!Array.isArray(exportData.quotes)) {
    exportData.quotes = [];
    warnings.push('No quotes found in export file');
  }

  if (!Array.isArray(exportData.pomodoroSessions)) {
    exportData.pomodoroSessions = [];
    warnings.push('No pomodoro sessions found in export file');
  }

  // Validate individual items
  const validatedData: ExportData = {
    // `typeof`, not `||`: these are rendered directly in the import preview, and `||` lets
    // any truthy value through — an object reaching React as a child throws, and the
    // app-wide ErrorBoundary takes the page down. This is the one input where the user
    // points the app at a file of their choosing.
    version: typeof exportData.version === 'string' ? exportData.version : 'unknown',
    formatVersion: typeof exportData.formatVersion === 'number' ? exportData.formatVersion : 0,
    exportDate:
      typeof exportData.exportDate === 'string' ? exportData.exportDate : new Date().toISOString(),
    insights: (exportData.insights as ExportData['insights']) || null,
    analytics: (exportData.analytics as ExportData['analytics']) || null,
    goals: validateGoals(exportData.goals as unknown[], warnings),
    quotes: validateQuotes(exportData.quotes as unknown[], warnings),
    pomodoroSessions: validatePomodoroSessions(exportData.pomodoroSessions as unknown[], warnings),
  };

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    data: validatedData,
  };
}

/**
 * Validate goals array
 */

/**
 * The last gate before an imported item reaches storage: the very schema the read path
 * uses. Without it the two boundaries can disagree, and they did — an item the importer
 * accepted, counted and reported as "successfully imported" would be dropped on the next
 * read and erased by the next edit, because every store rewrites its whole array.
 *
 * Rejecting here costs the user one item and tells them which. Accepting costs them the
 * item silently, later.
 */
function accepts(
  schema: { safeParse: (value: unknown) => { success: boolean } },
  candidate: unknown,
  field: string,
  warnings: string[]
): boolean {
  if (schema.safeParse(candidate).success) {
    return true;
  }
  // A warning, never an error: `isValid` is `errors.length === 0`, so an error here would
  // hide the Import button and discard every good item in the file.
  warnings.push(`${field} does not match the expected shape and was skipped`);
  return false;
}

function isQuoteCategory(value: unknown): value is Quote['category'] {
  return quoteCategorySchema.safeParse(value).success;
}

/** Neither a numeric timestamp (which `||` let through) nor `''` (which `typeof` does). */
function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') {
    return undefined;
  }
  return value;
}

function validateGoals(goals: unknown[], warnings: string[]): Goal[] {
  const validGoals: Goal[] = [];

  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i] as Record<string, unknown>;

    if (typeof goal !== 'object' || goal === null) {
      warnings.push(`goals[${i}] is not an object and was skipped`);
      continue;
    }

    // Check required fields
    if (typeof goal.id !== 'string' || !goal.id) {
      warnings.push(`goals[${i}] has no usable id and was skipped`);
      continue;
    }

    if (typeof goal.text !== 'string') {
      warnings.push(`goals[${i}] has no text and was skipped`);
      continue;
    }

    const candidate: Goal = {
      id: goal.id,
      text: goal.text,
      completed: Boolean(goal.completed),
      createdAt: nonEmptyString(goal.createdAt) ?? new Date().toISOString(),
      date: nonEmptyString(goal.date) ?? getTodayDateString(),
      // Preserve optional fields when present
      ...(goal.type === 'task' || goal.type === 'objective' ? { type: goal.type } : {}),
      ...(typeof goal.parentId === 'string' ? { parentId: goal.parentId } : {}),
      ...(typeof goal.transferCount === 'number' ? { transferCount: goal.transferCount } : {}),
      ...(typeof goal.description === 'string' ? { description: goal.description } : {}),
      ...(typeof goal.dueDate === 'string' ? { dueDate: goal.dueDate } : {}),
      ...(typeof goal.sortOrder === 'number' ? { sortOrder: goal.sortOrder } : {}),
      // Filtered per item, like every other list in this codebase: one malformed subtask
      // costs that subtask, not the goal it belongs to.
      ...(Array.isArray(goal.subtasks)
        ? { subtasks: goal.subtasks.filter((s) => subtaskSchema.safeParse(s).success) as Subtask[] }
        : {}),
    };

    if (!accepts(goalSchema, candidate, `goals[${i}]`, warnings)) {
      continue;
    }
    validGoals.push(candidate);
  }

  return validGoals;
}

/**
 * Validate quotes array
 */
function validateQuotes(quotes: unknown[], warnings: string[]): Quote[] {
  const validQuotes: Quote[] = [];
  let refiled = 0;

  for (let i = 0; i < quotes.length; i++) {
    const quote = quotes[i] as Record<string, unknown>;

    if (typeof quote !== 'object' || quote === null) {
      warnings.push(`quotes[${i}] is not an object and was skipped`);
      continue;
    }

    // Check required fields
    if (typeof quote.id !== 'string' || !quote.id) {
      warnings.push(`quotes[${i}] has no usable id and was skipped`);
      continue;
    }

    if (typeof quote.text !== 'string' || !quote.text) {
      warnings.push(`quotes[${i}] has no text and was skipped`);
      continue;
    }

    // Counted, not warned per item: this rewrites the user's own data and persists it, so it has
    // to reach the preview — but one line per quote would bury the Import button on a large file.
    if (quote.category !== undefined && !isQuoteCategory(quote.category)) {
      refiled += 1;
    }

    const candidate: Quote = {
      id: quote.id,
      text: quote.text,
      author: nonEmptyString(quote.author) ?? 'Unknown',
      // Checked against the same enum the reader uses. An unrecognised category used to be
      // written verbatim and then dropped on the next read.
      category: isQuoteCategory(quote.category) ? quote.category : 'inspiration',
      isCustom: true, // All imported quotes are marked as custom
      isFavorite: Boolean(quote.isFavorite),
      isHidden: Boolean(quote.isHidden),
      viewCount: typeof quote.viewCount === 'number' ? quote.viewCount : 0,
      ...(typeof quote.lastViewed === 'string' ? { lastViewed: quote.lastViewed } : {}),
      ...(typeof quote.source === 'string' ? { source: quote.source } : {}),
      ...(typeof quote.notes === 'string' ? { notes: quote.notes } : {}),
      // The twelfth field, and the only one this literal used to omit — so re-importing a
      // backup silently stripped every quote's collection membership.
      ...(Array.isArray(quote.collectionIds)
        ? { collectionIds: quote.collectionIds.filter((id) => typeof id === 'string') }
        : {}),
    };

    if (!accepts(quoteSchema, candidate, `quotes[${i}]`, warnings)) {
      continue;
    }
    validQuotes.push(candidate);
  }

  if (refiled > 0) {
    warnings.push(
      refiled === 1
        ? '1 quote had an unrecognised category and was filed under inspiration'
        : `${refiled} quotes had unrecognised categories and were filed under inspiration`
    );
  }

  return validQuotes;
}

/**
 * Validate pomodoro sessions array
 */
function validatePomodoroSessions(sessions: unknown[], warnings: string[]): PomodoroSession[] {
  const validSessions: PomodoroSession[] = [];
  let rerecorded = 0;

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i] as Record<string, unknown>;

    if (typeof session !== 'object' || session === null) {
      warnings.push(`pomodoroSessions[${i}] is not an object and was skipped`);
      continue;
    }

    // Check required fields
    if (typeof session.id !== 'string' || !session.id) {
      warnings.push(`pomodoroSessions[${i}] has no usable id and was skipped`);
      continue;
    }

    if (typeof session.startedAt !== 'string') {
      warnings.push(`pomodoroSessions[${i}] has no start time and was skipped`);
      continue;
    }

    const sessionTypes: PomodoroSession['type'][] = ['work', 'break', 'longBreak'];
    if (
      session.type !== undefined &&
      !sessionTypes.includes(session.type as PomodoroSession['type'])
    ) {
      rerecorded += 1;
    }
    const candidate: PomodoroSession = {
      id: session.id,
      startedAt: session.startedAt,
      ...(typeof session.completedAt === 'string' ? { completedAt: session.completedAt } : {}),
      interrupted: Boolean(session.interrupted),
      duration: typeof session.duration === 'number' ? session.duration : 25,
      type: sessionTypes.includes(session.type as PomodoroSession['type'])
        ? (session.type as PomodoroSession['type'])
        : 'work',
      ...(typeof session.goalId === 'string' ? { goalId: session.goalId } : {}),
    };

    if (!accepts(pomodoroSessionSchema, candidate, `pomodoroSessions[${i}]`, warnings)) {
      continue;
    }
    validSessions.push(candidate);
  }

  if (rerecorded > 0) {
    warnings.push(
      rerecorded === 1
        ? '1 session had an unrecognised type and was recorded as work'
        : `${rerecorded} sessions had unrecognised types and were recorded as work`
    );
  }

  return validSessions;
}
