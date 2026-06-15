import type { Reminder } from '../types';

/**
 * Build a minimal, non-recurring reminder for cadence/notification tests.
 * Hand-built (shared cannot depend on @cuewise/test-utils); pass `dueDate`
 * and `recurring` overrides per test.
 */
export function baseReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    text: 'x',
    dueDate: '2026-06-13T09:00:00.000Z',
    completed: false,
    notified: false,
    ...overrides,
  };
}
