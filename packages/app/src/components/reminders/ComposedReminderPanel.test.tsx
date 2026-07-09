import { createSettingsStoreMock, reminderFactory } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../../stores/settings-store';
import { ComposedReminderPanel } from './ComposedReminderPanel';

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: vi.fn(),
}));

const HOUR_MS = 60 * 60 * 1000;

// The panel reads `state.settings.timeFormat` via selector — apply it on the mock.
function mockTimeFormat(timeFormat: '12h' | '24h') {
  vi.mocked(useSettingsStore).mockImplementation(createSettingsStoreMock({ timeFormat }));
}

/** A dueDate later TODAY (now + 2h). The clock is frozen at 09:00, so this stays same-day. */
function laterTodayDueDate(): string {
  return new Date(Date.now() + 2 * HOUR_MS).toISOString();
}

function buildMixedReminders() {
  const habit = reminderFactory.build({
    id: 'habit-1',
    text: 'Drink water',
    category: 'health',
    dueDate: new Date(Date.now() + HOUR_MS).toISOString(),
    recurring: { frequency: 'interval', intervalMinutes: 30 },
  });
  const scheduled = reminderFactory.build({
    id: 'sched-1',
    text: 'Daily standup',
    category: 'productivity',
    dueDate: new Date(Date.now() + 3 * HOUR_MS).toISOString(),
    recurring: { frequency: 'daily' },
  });
  const notified = reminderFactory.build({
    id: 'notified-1',
    text: 'Submit timesheet',
    category: 'productivity',
    dueDate: new Date(Date.now() - HOUR_MS).toISOString(),
    notified: true,
    recurring: { frequency: 'daily' },
  });
  return { habit, scheduled, notified };
}

function defaultProps() {
  return {
    onToggle: vi.fn(),
    onSnooze: vi.fn(),
    onPauseToggle: vi.fn(),
    onAdd: vi.fn(),
  };
}

describe('ComposedReminderPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Freeze the clock to a fixed mid-morning Monday so day-boundary math is
    // deterministic. Fake only Date so component timers and RTL are unaffected.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T09:00:00'));
    mockTimeFormat('12h');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a habit pill for the interval reminder and a hero card for the notified one', () => {
    const { habit, scheduled, notified } = buildMixedReminders();
    render(<ComposedReminderPanel reminders={[notified, scheduled, habit]} {...defaultProps()} />);

    // Interval reminder surfaces as a tap-to-done habit pill.
    expect(screen.getByRole('button', { name: 'Mark Drink water done' })).toBeInTheDocument();
    // The past-due notified item borrows the hero "needs response" treatment.
    expect(screen.getByText('Submit timesheet')).toBeInTheDocument();
    expect(screen.getByText('Needs response')).toBeInTheDocument();
    // The other scheduled item stays a clean row.
    expect(screen.getByText('Daily standup')).toBeInTheDocument();
  });

  it('calls onToggle with the habit id when its pill is clicked', () => {
    const { habit } = buildMixedReminders();
    const props = defaultProps();
    render(<ComposedReminderPanel reminders={[habit]} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark Drink water done' }));
    expect(props.onToggle).toHaveBeenCalledWith('habit-1');
  });

  it('switches layout via the in-header view switcher', () => {
    const { habit } = buildMixedReminders();
    const onChange = vi.fn();
    render(
      <ComposedReminderPanel
        reminders={[habit]}
        {...defaultProps()}
        viewSwitcher={{ layout: 'composed', onChange }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agenda view' }));
    expect(onChange).toHaveBeenCalledWith('agenda');
  });

  it('shows today and tomorrow scheduled items in one merged list with a "TMRW" day label', () => {
    const todayItem = reminderFactory.build({
      id: 'sched-today',
      text: 'Today catch-up',
      category: 'productivity',
      dueDate: laterTodayDueDate(),
    });
    const tomorrowItem = reminderFactory.build({
      id: 'sched-tomorrow',
      text: 'Tomorrow planning session',
      category: 'productivity',
      dueDate: new Date(Date.now() + 24 * HOUR_MS).toISOString(),
    });
    render(<ComposedReminderPanel reminders={[todayItem, tomorrowItem]} {...defaultProps()} />);

    // Both items share the single Scheduled list — no separate "Upcoming" divider.
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();
    expect(screen.getByText('Today catch-up')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow planning session')).toBeInTheDocument();
    // The tomorrow row still renders its compact "TMRW" day label inline.
    expect(screen.getByText('TMRW')).toBeInTheDocument();
  });

  it('caps scheduled rows at 3 and reveals the rest on "+N more"', () => {
    // 5 future same-day daily reminders all classify as upcoming rows (none overdue/notified, so no hero).
    const items = Array.from({ length: 5 }, (_, i) =>
      reminderFactory.build({
        id: `sched-today-${i}`,
        text: `Today task ${i}`,
        category: 'productivity',
        dueDate: laterTodayDueDate(),
        recurring: { frequency: 'daily' },
      })
    );
    render(<ComposedReminderPanel reminders={items} {...defaultProps()} />);

    // Collapsed: only the first 3 rows show, with a "+2 more" control.
    expect(screen.getByText('Today task 0')).toBeInTheDocument();
    expect(screen.getByText('Today task 1')).toBeInTheDocument();
    expect(screen.getByText('Today task 2')).toBeInTheDocument();
    expect(screen.queryByText('Today task 3')).not.toBeInTheDocument();
    expect(screen.queryByText('Today task 4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /\+2 more/ }));

    // Expanded: the surplus rows now appear.
    expect(screen.getByText('Today task 3')).toBeInTheDocument();
    expect(screen.getByText('Today task 4')).toBeInTheDocument();
  });

  it('keeps a nudging habit visible when the collapsed strip overflows', () => {
    // Six habits exceed the dynamic cap (max 4), so the strip always overflows —
    // the exact surplus depends on cap tuning, which this test must not pin.
    const shortTitles = ['Go', 'Up', 'Be', 'Do', 'Hi'];
    const calm = shortTitles.map((title, i) =>
      reminderFactory.build({
        id: `habit-calm-${i}`,
        text: title,
        category: 'health',
        dueDate: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
        recurring: { frequency: 'interval', intervalMinutes: 30 },
      })
    );
    // One overdue habit must surface despite collapse via nudging-first sort.
    const nudging = reminderFactory.build({
      id: 'habit-nudging',
      text: 'Ok',
      category: 'health',
      dueDate: new Date(Date.now() - HOUR_MS).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    render(<ComposedReminderPanel reminders={[...calm, nudging]} {...defaultProps()} />);

    // Collapsed: the strip caps the pills and a "+N more" control hides the surplus.
    expect(screen.getByText(/\+\d+ more/)).toBeInTheDocument();
    // The nudging habit is surfaced first (nudging-first sort), so it stays visible.
    expect(screen.getByText('Ok')).toBeInTheDocument();
  });

  it('renders a 24-hour clock when the timeFormat setting is "24h"', () => {
    mockTimeFormat('24h');
    // Tomorrow at 17:30 local: a two-line scheduled row whose clock is unambiguous.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(17, 30, 0, 0);
    const item = reminderFactory.build({
      id: 'sched-24h',
      text: 'Evening review',
      category: 'productivity',
      dueDate: tomorrow.toISOString(),
    });
    render(<ComposedReminderPanel reminders={[item]} {...defaultProps()} />);

    // The setting flows setting → panel → row: 24h shows "17:30" with no AM/PM.
    expect(screen.getByText('17:30')).toBeInTheDocument();
    expect(screen.queryByText(/PM/)).not.toBeInTheDocument();
  });
});
