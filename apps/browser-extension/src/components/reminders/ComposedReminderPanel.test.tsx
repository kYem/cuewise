import { reminderFactory } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposedReminderPanel } from './ComposedReminderPanel';

const HOUR_MS = 60 * 60 * 1000;

/**
 * A dueDate later TODAY: now + 2h, but if that crosses midnight, anchor to a
 * fixed early-evening time today so the calendar day stays unambiguous.
 */
function laterTodayDueDate(): string {
  const candidate = new Date(Date.now() + 2 * HOUR_MS);
  if (candidate.getDate() !== new Date().getDate()) {
    const earlyEvening = new Date();
    earlyEvening.setHours(18, 0, 0, 0);
    return earlyEvening.toISOString();
  }
  return candidate.toISOString();
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
    const onLayoutChange = vi.fn();
    render(
      <ComposedReminderPanel
        reminders={[habit]}
        {...defaultProps()}
        layout="composed"
        onLayoutChange={onLayoutChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agenda view' }));
    expect(onLayoutChange).toHaveBeenCalledWith('agenda');
  });

  it('splits tomorrow scheduled items into an Upcoming sub-group with a "Tmrw" day label', () => {
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
      dueDate: new Date(Date.now() + 26 * HOUR_MS).toISOString(),
    });
    render(<ComposedReminderPanel reminders={[todayItem, tomorrowItem]} {...defaultProps()} />);

    // The tomorrow item moves under an "Upcoming" divider with a compact day label.
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow planning session')).toBeInTheDocument();
    expect(screen.getByText('Tmrw')).toBeInTheDocument();
  });

  it('keeps a nudging habit visible when the collapsed strip overflows', () => {
    // 8 interval habits exceeds the collapse threshold (6), forcing a "+N more".
    const calm = Array.from({ length: 7 }, (_, i) =>
      reminderFactory.build({
        id: `habit-calm-${i}`,
        text: `Calm habit ${i}`,
        category: 'health',
        dueDate: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
        recurring: { frequency: 'interval', intervalMinutes: 30 },
      })
    );
    // One overdue habit must surface despite collapse via nudging-first sort.
    const nudging = reminderFactory.build({
      id: 'habit-nudging',
      text: 'Stretch now',
      category: 'health',
      dueDate: new Date(Date.now() - HOUR_MS).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    render(<ComposedReminderPanel reminders={[...calm, nudging]} {...defaultProps()} />);

    // Collapsed: an overflow control hides the surplus calm pills.
    expect(screen.getByText('+2 more')).toBeInTheDocument();
    // The nudging habit is surfaced first, so it stays visible.
    expect(screen.getByText('Stretch now')).toBeInTheDocument();
  });
});
