import type { AllDayCalendarEvent, TimedCalendarEvent } from '@cuewise/shared';
import type { MockStoreOf } from '@cuewise/test-utils';

// Re-export the canonical selector mock so CalendarStrip tests use the shared one.
export { createSelectorMock } from '@cuewise/test-utils';

import { vi } from 'vitest';
import type { useCalendarStore } from '../../stores/calendar-store';

type CalendarStore = ReturnType<typeof useCalendarStore.getState>;

export type MockCalendarStore = MockStoreOf<
  CalendarStore,
  'connected' | 'events' | 'isLoading' | 'error' | 'lastSync' | 'connect' | 'refresh' | 'disconnect'
>;

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
