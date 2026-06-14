import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCalendarStore } from '../stores/calendar-store';
import { useSettingsStore } from '../stores/settings-store';
import {
  allDayEvent,
  createCalendarStore,
  createSelectorMock,
  type MockCalendarStore,
  timedEvent,
} from './__fixtures__/calendar-strip.fixtures';
import { CalendarStrip } from './CalendarStrip';

vi.mock('../stores/calendar-store', () => ({ useCalendarStore: vi.fn() }));
vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));

function mountWith(store: MockCalendarStore, timeFormat: '12h' | '24h' = '12h') {
  vi.mocked(useCalendarStore).mockImplementation(createSelectorMock(store));
  vi.mocked(useSettingsStore).mockImplementation(createSelectorMock({ settings: { timeFormat } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Fix "now" to noon so past/future events are deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-14T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CalendarStrip - not connected', () => {
  it('shows a connect button and calls connect when clicked', () => {
    const store = createCalendarStore({ connected: false });
    mountWith(store);

    render(<CalendarStrip />);

    const button = screen.getByRole('button', { name: /connect google calendar/i });
    fireEvent.click(button);

    expect(store.connect).toHaveBeenCalledOnce();
  });
});

describe('CalendarStrip - all-day events', () => {
  it('renders an "All day" label instead of a clock time', () => {
    const store = createCalendarStore({
      events: [allDayEvent('a1', '2026-06-14', '2026-06-15', 'Company holiday')],
    });
    mountWith(store);

    render(<CalendarStrip />);

    expect(screen.getByText('All day')).toBeInTheDocument();
    expect(screen.getByText('Company holiday')).toBeInTheDocument();
  });

  it("keeps today's all-day event visible in lean mode (not treated as past)", () => {
    const store = createCalendarStore({
      events: [allDayEvent('a1', '2026-06-14', '2026-06-15', 'Company holiday')],
    });
    mountWith(store);

    render(<CalendarStrip lean />);

    expect(screen.getByText('Company holiday')).toBeInTheDocument();
  });
});

describe('CalendarStrip - lean mode', () => {
  it('drops past events and caps the list at three', () => {
    const store = createCalendarStore({
      events: [
        timedEvent('past', '2026-06-14T08:00:00', '2026-06-14T09:00:00', 'Earlier'),
        timedEvent('f1', '2026-06-14T13:00:00', '2026-06-14T14:00:00', 'Future one'),
        timedEvent('f2', '2026-06-14T15:00:00', '2026-06-14T16:00:00', 'Future two'),
        timedEvent('f3', '2026-06-14T17:00:00', '2026-06-14T18:00:00', 'Future three'),
        timedEvent('f4', '2026-06-14T19:00:00', '2026-06-14T20:00:00', 'Future four'),
      ],
    });
    mountWith(store);

    render(<CalendarStrip lean />);

    expect(screen.queryByText('Earlier')).not.toBeInTheDocument();
    expect(screen.getByText('Future one')).toBeInTheDocument();
    expect(screen.getByText('Future three')).toBeInTheDocument();
    expect(screen.queryByText('Future four')).not.toBeInTheDocument();
  });
});

describe('CalendarStrip - time formatting', () => {
  it('renders 12-hour times by default', () => {
    const store = createCalendarStore({
      events: [timedEvent('e', '2026-06-14T13:00:00', '2026-06-14T14:00:00', 'Afternoon sync')],
    });
    mountWith(store, '12h');

    render(<CalendarStrip />);

    expect(screen.getByText('1pm')).toBeInTheDocument();
  });

  it('renders 24-hour times when configured', () => {
    const store = createCalendarStore({
      events: [timedEvent('e', '2026-06-14T13:00:00', '2026-06-14T14:00:00', 'Afternoon sync')],
    });
    mountWith(store, '24h');

    render(<CalendarStrip />);

    expect(screen.getByText('13:00')).toBeInTheDocument();
  });
});
