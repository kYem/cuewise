import type { AllDayCalendarEvent, CalendarEvent, TimedCalendarEvent } from '@cuewise/shared';

// Re-export the canonical selector mock so CalendarStrip tests use the shared one.
export { createSelectorMock } from '@cuewise/test-utils';

import { vi } from 'vitest';

export interface MockCalendarStore {
  connected: boolean;
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  lastSync: string | null;
  connect: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

export function createCalendarStore(overrides: Partial<MockCalendarStore> = {}): MockCalendarStore {
  return {
    connected: true,
    events: [],
    isLoading: false,
    error: null,
    lastSync: null,
    connect: vi.fn(),
    refresh: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  };
}

export function timedEvent(id: string, start: string, end: string, title = id): TimedCalendarEvent {
  return { id, title, start, end, allDay: false };
}

export function allDayEvent(
  id: string,
  date: string,
  nextDate: string,
  title = id
): AllDayCalendarEvent {
  return { id, title, startDate: date, endDate: nextDate, allDay: true };
}
