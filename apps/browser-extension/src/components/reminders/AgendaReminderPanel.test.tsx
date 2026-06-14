import { reminderFactory } from '@cuewise/test-utils';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgendaReminderPanel } from './AgendaReminderPanel';

const HOUR_MS = 60 * 60 * 1000;

/**
 * A dueDate later TODAY: now + 90min, but if that crosses midnight, anchor to a
 * fixed early-evening time today so the calendar day stays unambiguous.
 */
function laterTodayDueDate(): string {
  const candidate = new Date(Date.now() + 90 * 60 * 1000);
  if (candidate.getDate() !== new Date().getDate()) {
    const earlyEvening = new Date();
    earlyEvening.setHours(18, 0, 0, 0);
    return earlyEvening.toISOString();
  }
  return candidate.toISOString();
}

function buildReminders() {
  const notified = reminderFactory.build({
    id: 'notified-1',
    text: 'Submit timesheet',
    category: 'productivity',
    dueDate: new Date(Date.now() - HOUR_MS).toISOString(),
    notified: true,
  });
  const upcoming = reminderFactory.build({
    id: 'upcoming-1',
    text: 'Review pull request',
    category: 'productivity',
    // Same-day so it lands in "Later today" regardless of when the test runs.
    dueDate: laterTodayDueDate(),
  });
  return { notified, upcoming };
}

/** The group wrapper for a header label, so we can scope queries to one group. */
function groupContainerFor(label: string): HTMLElement {
  const container = screen.getByText(label).closest('.mb-2');
  expect(container).toBeInstanceOf(HTMLElement);
  return container as HTMLElement;
}

function defaultProps() {
  return {
    onToggle: vi.fn(),
    onSnooze: vi.fn(),
    onPauseToggle: vi.fn(),
    onAdd: vi.fn(),
  };
}

describe('AgendaReminderPanel', () => {
  it('groups a past-due notified reminder under Needs response and a future one under Later today', () => {
    const { notified, upcoming } = buildReminders();
    render(<AgendaReminderPanel reminders={[notified, upcoming]} {...defaultProps()} />);

    expect(screen.getByText('Needs response')).toBeInTheDocument();
    expect(screen.getByText('Submit timesheet')).toBeInTheDocument();
    expect(screen.getByText('Later today')).toBeInTheDocument();
    expect(screen.getByText('Review pull request')).toBeInTheDocument();
  });

  it('splits upcoming into Later today (due today) and Upcoming (due a later day)', () => {
    const laterToday = reminderFactory.build({
      id: 'later-today-1',
      text: 'Stretch break',
      category: 'health',
      dueDate: laterTodayDueDate(),
    });
    const nextDay = reminderFactory.build({
      id: 'next-day-1',
      text: 'Dentist appointment',
      category: 'personal',
      dueDate: new Date(Date.now() + 50 * HOUR_MS).toISOString(),
    });
    render(<AgendaReminderPanel reminders={[laterToday, nextDay]} {...defaultProps()} />);

    const laterTodayGroup = groupContainerFor('Later today');
    expect(within(laterTodayGroup).getByText('Stretch break')).toBeInTheDocument();
    expect(within(laterTodayGroup).queryByText('Dentist appointment')).not.toBeInTheDocument();

    const upcomingGroup = groupContainerFor('Upcoming');
    expect(within(upcomingGroup).getByText('Dentist appointment')).toBeInTheDocument();
  });

  it('calls onToggle with the reminder id when its category-check is clicked', () => {
    const { upcoming } = buildReminders();
    const props = defaultProps();
    render(<AgendaReminderPanel reminders={[upcoming]} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(props.onToggle).toHaveBeenCalledWith('upcoming-1');
  });
});
