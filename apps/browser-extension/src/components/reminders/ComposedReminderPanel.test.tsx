import { reminderFactory } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposedReminderPanel } from './ComposedReminderPanel';

const HOUR_MS = 60 * 60 * 1000;

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
});
