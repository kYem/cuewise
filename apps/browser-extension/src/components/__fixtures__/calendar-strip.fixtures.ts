import type { CalendarEvent } from '@cuewise/shared';

// Re-export the canonical selector mock so CalendarStrip tests use the shared one.
export { createSelectorMock } from '@cuewise/test-utils';

import { vi } from 'vitest';

export interface MockCalendarStore {
  connected: boolean;
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  connect: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
}

export function createCalendarStore(overrides: Partial<MockCalendarStore> = {}): MockCalendarStore {
  return {
    connected: true,
    events: [],
    isLoading: false,
    error: null,
    connect: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

export function timedEvent(id: string, start: string, end: string, title = id): CalendarEvent {
  return { id, title, start, end, allDay: false };
}

export function allDayEvent(id: string, date: string, nextDate: string, title = id): CalendarEvent {
  return { id, title, start: date, end: nextDate, allDay: true };
}
