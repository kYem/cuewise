import type { CalendarEvent } from '@cuewise/shared';
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

// CalendarStrip calls the store both with a useShallow selector and with bare
// selectors (s.connect, s.refresh); this mock handles both and the no-arg call.
export function createSelectorMock<T extends object>(store: T) {
  // biome-ignore lint/suspicious/noExplicitAny: selector operates on the store shape
  return (selector?: (state: any) => unknown) => {
    if (selector) {
      return selector(store);
    }
    return store;
  };
}

export function timedEvent(id: string, start: string, end: string, title = id): CalendarEvent {
  return { id, title, start, end, allDay: false };
}

export function allDayEvent(id: string, date: string, nextDate: string, title = id): CalendarEvent {
  return { id, title, start: date, end: nextDate, allDay: true };
}
