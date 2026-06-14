import { reminderFactory } from '@cuewise/test-utils';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgendaReminderPanel } from './AgendaReminderPanel';

const HOUR_MS = 60 * 60 * 1000;

/**
 * A dueDate later TODAY: now + `minutesFromNow`, but if that crosses midnight,
 * anchor to a fixed early-evening time today so the calendar day stays unambiguous.
 */
function laterTodayDueDate(minutesFromNow = 90): string {
  const candidate = new Date(Date.now() + minutesFromNow * 60 * 1000);
  if (candidate.getDate() !== new Date().getDate()) {
    const earlyEvening = new Date();
    earlyEvening.setHours(18, 0, 0, 0);
    earlyEvening.setMinutes(minutesFromNow);
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
  const container = screen.getByText(label).closest('.mb-1\\.5');
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
  it('groups a past-due notified reminder under Needs response and a future one under Scheduled', () => {
    const { notified, upcoming } = buildReminders();
    render(<AgendaReminderPanel reminders={[notified, upcoming]} {...defaultProps()} />);

    expect(screen.getByText('Needs response')).toBeInTheDocument();
    expect(screen.getByText('Submit timesheet')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Review pull request')).toBeInTheDocument();
  });

  it('merges today and later-day upcoming reminders into one Scheduled group, with a TMRW rail for the next-day row', () => {
    const laterToday = reminderFactory.build({
      id: 'later-today-1',
      text: 'Stretch break',
      category: 'health',
      dueDate: laterTodayDueDate(),
    });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const nextDay = reminderFactory.build({
      id: 'next-day-1',
      text: 'Dentist appointment',
      category: 'personal',
      dueDate: tomorrow.toISOString(),
    });
    render(<AgendaReminderPanel reminders={[laterToday, nextDay]} {...defaultProps()} />);

    expect(screen.queryByText('Later today')).not.toBeInTheDocument();
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument();

    const scheduledGroup = groupContainerFor('Scheduled');
    expect(within(scheduledGroup).getByText('Stretch break')).toBeInTheDocument();
    expect(within(scheduledGroup).getByText('Dentist appointment')).toBeInTheDocument();
    // The next-day row still carries its day-rail label (TMRW for due-tomorrow items).
    expect(within(scheduledGroup).getByText('TMRW')).toBeInTheDocument();
  });

  it('renders a TMRW day label on an upcoming row due tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const tomorrowItem = reminderFactory.build({
      id: 'tomorrow-1',
      text: 'Tomorrow planning',
      category: 'productivity',
      dueDate: tomorrow.toISOString(),
    });
    render(<AgendaReminderPanel reminders={[tomorrowItem]} {...defaultProps()} />);

    const group = groupContainerFor('Scheduled');
    expect(within(group).getByText('TMRW')).toBeInTheDocument();
  });

  it('caps a long Scheduled group at GROUP_LIMIT and reveals the rest via the show-more toggle', () => {
    // 6 reminders all due later today (staggered times) so they share the "Scheduled" group.
    const reminders = Array.from({ length: 6 }, (_, i) =>
      reminderFactory.build({
        id: `later-today-${i}`,
        text: `Later task ${i + 1}`,
        category: 'productivity',
        dueDate: laterTodayDueDate(90 + i * 5),
      })
    );
    render(<AgendaReminderPanel reminders={reminders} {...defaultProps()} />);

    const group = groupContainerFor('Scheduled');
    // Only the first GROUP_LIMIT (4) rows show; the 5th and 6th are hidden.
    expect(within(group).getByText('Later task 1')).toBeInTheDocument();
    expect(within(group).getByText('Later task 4')).toBeInTheDocument();
    expect(within(group).queryByText('Later task 5')).not.toBeInTheDocument();
    expect(within(group).queryByText('Later task 6')).not.toBeInTheDocument();

    const toggle = within(group).getByRole('button', { name: /\+2 more/ });
    fireEvent.click(toggle);

    expect(within(group).getByText('Later task 5')).toBeInTheDocument();
    expect(within(group).getByText('Later task 6')).toBeInTheDocument();
  });

  it('calls onToggle with the reminder id when its category-check is clicked', () => {
    const { upcoming } = buildReminders();
    const props = defaultProps();
    render(<AgendaReminderPanel reminders={[upcoming]} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(props.onToggle).toHaveBeenCalledWith('upcoming-1');
  });
});
