import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('surfaces a connection error beneath the connect button', () => {
    const store = createCalendarStore({ connected: false, error: 'Failed to connect calendar' });
    mountWith(store);

    render(<CalendarStrip />);

    expect(screen.getByText('Failed to connect calendar')).toBeInTheDocument();
  });

  it('shows a connecting state and disables the button while loading', () => {
    const store = createCalendarStore({ connected: false, isLoading: true });
    mountWith(store);

    render(<CalendarStrip />);

    const button = screen.getByRole('button', { name: /connecting/i });
    expect(button).toBeDisabled();
  });
});

describe('CalendarStrip - variant', () => {
  it('uses theme tokens in the surface variant', () => {
    const store = createCalendarStore({ connected: false });
    mountWith(store);

    const { container } = render(<CalendarStrip variant="surface" />);

    expect(container.querySelector('.text-primary')).toBeInTheDocument();
    expect(container.querySelector('.text-white')).not.toBeInTheDocument();
  });

  it('uses the white-on-dark overlay by default', () => {
    const store = createCalendarStore({ connected: false });
    mountWith(store);

    const { container } = render(<CalendarStrip />);

    expect(container.querySelector('.text-white')).toBeInTheDocument();
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

  it('orders timed meetings before all-day events so meetings keep their slots', () => {
    const store = createCalendarStore({
      events: [
        allDayEvent('a1', '2026-06-14', '2026-06-15', 'PTO'),
        allDayEvent('a2', '2026-06-14', '2026-06-15', 'Conference'),
        allDayEvent('a3', '2026-06-14', '2026-06-15', 'Birthday'),
        timedEvent('m', '2026-06-14T15:00:00', '2026-06-14T16:00:00', 'Afternoon meeting'),
      ],
    });
    mountWith(store);

    render(<CalendarStrip lean />);

    const meeting = screen.getByText('Afternoon meeting');
    const pto = screen.getByText('PTO');
    // Meeting renders before the all-day banners, and the 3-slot cap drops the
    // third all-day rather than the meeting.
    expect(meeting.compareDocumentPosition(pto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Birthday')).not.toBeInTheDocument();
  });
});

describe('CalendarStrip - full mode (past + now-line)', () => {
  it('strikes through past timed events and draws the now-line before the next one', () => {
    const store = createCalendarStore({
      events: [
        timedEvent('past', '2026-06-14T08:00:00', '2026-06-14T09:00:00', 'Earlier'),
        timedEvent('future', '2026-06-14T13:00:00', '2026-06-14T14:00:00', 'Later'),
      ],
    });
    mountWith(store);

    render(<CalendarStrip />);

    expect(screen.getByText('Earlier').className).toContain('line-through');
    expect(screen.getByText('Later').className).not.toContain('line-through');
    // Now-line shows the current time (noon) between the past and future event.
    expect(screen.getByText('12pm')).toBeInTheDocument();
  });

  it('never strikes through an all-day event even when its end is before now', () => {
    const store = createCalendarStore({
      events: [allDayEvent('h', '2026-06-13', '2026-06-14', 'Yesterday onward')],
    });
    mountWith(store);

    render(<CalendarStrip />);

    expect(screen.getByText('Yesterday onward').className).not.toContain('line-through');
  });

  it('draws the now-line only once when a long event overlaps later past events', () => {
    const store = createCalendarStore({
      events: [
        timedEvent('p1', '2026-06-14T08:00:00', '2026-06-14T09:00:00', 'Early standup'),
        timedEvent('long', '2026-06-14T09:00:00', '2026-06-14T14:00:00', 'Focus block'),
        timedEvent('p2', '2026-06-14T09:30:00', '2026-06-14T09:45:00', 'Quick sync'),
        timedEvent('f', '2026-06-14T13:30:00', '2026-06-14T14:30:00', 'Review'),
      ],
    });
    mountWith(store);

    render(<CalendarStrip />);

    // The "now" marker (noon) must appear exactly once despite two past→future
    // transitions in the start-sorted list.
    expect(screen.getAllByText('12pm')).toHaveLength(1);
  });

  it('still draws the now-line when a non-past all-day event leads the list', () => {
    const store = createCalendarStore({
      events: [
        allDayEvent('a', '2026-06-14', '2026-06-15', 'Company holiday'),
        timedEvent('p', '2026-06-14T08:00:00', '2026-06-14T09:00:00', 'Morning standup'),
        timedEvent('f', '2026-06-14T13:00:00', '2026-06-14T14:00:00', 'Afternoon review'),
      ],
    });
    mountWith(store);

    render(<CalendarStrip />);

    // The all-day banner sorts first and is never "past", but the now-line must
    // still render at the real past→upcoming boundary further down the list.
    expect(screen.getByText('12pm')).toBeInTheDocument();
  });

  it('shows no now-line when every event is still upcoming', () => {
    const store = createCalendarStore({
      events: [
        timedEvent('f1', '2026-06-14T13:00:00', '2026-06-14T14:00:00', 'Afternoon review'),
        timedEvent('f2', '2026-06-14T15:00:00', '2026-06-14T16:00:00', 'Sync'),
      ],
    });
    mountWith(store);

    render(<CalendarStrip />);

    // No past→upcoming transition exists, so the now-line marker must be absent.
    expect(screen.queryByText('12pm')).not.toBeInTheDocument();
  });

  it('shows no now-line when every event is already past', () => {
    const store = createCalendarStore({
      events: [
        timedEvent('p1', '2026-06-14T08:00:00', '2026-06-14T09:00:00', 'Early standup'),
        timedEvent('p2', '2026-06-14T09:30:00', '2026-06-14T10:00:00', 'Quick sync'),
      ],
    });
    mountWith(store);

    render(<CalendarStrip />);

    expect(screen.queryByText('12pm')).not.toBeInTheDocument();
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

  it('zero-pads single-digit hours in 24-hour mode', () => {
    const store = createCalendarStore({
      events: [timedEvent('e', '2026-06-14T09:00:00', '2026-06-14T10:00:00', 'Morning sync')],
    });
    mountWith(store, '24h');

    render(<CalendarStrip />);

    expect(screen.getByText('09:00')).toBeInTheDocument();
  });

  it('renders noon as 12pm and midnight as 12am in 12-hour mode', () => {
    const store = createCalendarStore({
      events: [
        timedEvent('noon', '2026-06-14T12:00:00', '2026-06-14T12:30:00', 'Lunch'),
        timedEvent('midnight', '2026-06-14T00:00:00', '2026-06-14T00:30:00', 'Late night'),
      ],
    });
    mountWith(store, '12h');

    render(<CalendarStrip />);

    expect(screen.getByText('12pm')).toBeInTheDocument();
    expect(screen.getByText('12am')).toBeInTheDocument();
  });

  it('includes minutes for non-zero 12-hour times', () => {
    const store = createCalendarStore({
      events: [timedEvent('sync', '2026-06-14T13:30:00', '2026-06-14T14:00:00', 'Sync')],
    });
    mountWith(store, '12h');

    render(<CalendarStrip />);

    expect(screen.getByText('1:30pm')).toBeInTheDocument();
  });
});

describe('CalendarStrip - connected status & actions', () => {
  it('calls refresh when the refresh button is clicked', () => {
    const store = createCalendarStore({
      connected: true,
      events: [timedEvent('e', '2026-06-14T13:00:00', '2026-06-14T14:00:00', 'Sync')],
    });
    mountWith(store);

    render(<CalendarStrip />);
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    expect(store.refresh).toHaveBeenCalledOnce();
  });

  it('shows the synced status dot (tooltip) when connected without an error', () => {
    const store = createCalendarStore({ connected: true });
    mountWith(store);

    render(<CalendarStrip />);

    expect(screen.getByRole('img', { name: 'Calendar synced' })).toBeInTheDocument();
  });

  it('shows the failed-sync status dot when connected with an error', () => {
    const store = createCalendarStore({ connected: true, error: 'Failed to refresh calendar' });
    mountWith(store);

    render(<CalendarStrip />);

    expect(screen.getByRole('img', { name: "Couldn't sync" })).toBeInTheDocument();
  });

  it('surfaces the failed-sync dot even in lean mode', () => {
    const store = createCalendarStore({ connected: true, error: 'Failed to refresh calendar' });
    mountWith(store);

    render(<CalendarStrip lean />);

    expect(screen.getByRole('img', { name: "Couldn't sync" })).toBeInTheDocument();
  });

  it('shows the status dot in lean mode too', () => {
    const store = createCalendarStore({ connected: true });
    mountWith(store);

    render(<CalendarStrip lean />);

    expect(screen.getByRole('img', { name: 'Calendar synced' })).toBeInTheDocument();
  });

  it('shows the empty-day message when connected with no events', () => {
    const store = createCalendarStore({ connected: true, events: [] });
    mountWith(store);

    render(<CalendarStrip />);

    expect(screen.getByText(/nothing left on the calendar today/i)).toBeInTheDocument();
  });

  it('renders events in the surface variant without overlay-white text', () => {
    const store = createCalendarStore({
      connected: true,
      events: [timedEvent('e', '2026-06-14T13:00:00', '2026-06-14T14:00:00', 'Afternoon sync')],
    });
    mountWith(store);

    const { container } = render(<CalendarStrip variant="surface" />);

    expect(screen.getByText('Afternoon sync')).toBeInTheDocument();
    expect(container.querySelector('.text-white')).not.toBeInTheDocument();
  });

  it('disconnects from the overflow menu', async () => {
    vi.useRealTimers(); // userEvent + Radix Popover + fake timers deadlocks
    const user = userEvent.setup();
    const store = createCalendarStore({ connected: true });
    mountWith(store);

    render(<CalendarStrip />);
    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(store.disconnect).toHaveBeenCalledOnce();
  });

  it('hides Reconnect when there is no sync error', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const store = createCalendarStore({ connected: true });
    mountWith(store);

    render(<CalendarStrip />);
    await user.click(screen.getByRole('button', { name: 'Calendar options' }));

    expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();
  });

  it('reconnects from the overflow menu when a sync error is present', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const store = createCalendarStore({ connected: true, error: 'Failed to refresh calendar' });
    mountWith(store);

    render(<CalendarStrip />);
    await user.click(screen.getByRole('button', { name: 'Calendar options' }));
    await user.click(screen.getByRole('button', { name: 'Reconnect' }));

    expect(store.connect).toHaveBeenCalledOnce();
  });

  it('shows a load-failure message when errored with no events', () => {
    const store = createCalendarStore({
      connected: true,
      events: [],
      error: 'Failed to refresh calendar',
    });
    mountWith(store);

    render(<CalendarStrip />);

    expect(screen.getByText(/couldn't load your calendar/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing left/i)).not.toBeInTheDocument();
  });
});
