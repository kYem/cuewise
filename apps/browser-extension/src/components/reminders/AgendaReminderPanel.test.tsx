import { reminderFactory } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgendaReminderPanel } from './AgendaReminderPanel';

const HOUR_MS = 60 * 60 * 1000;

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
    dueDate: new Date(Date.now() + 3 * HOUR_MS).toISOString(),
  });
  return { notified, upcoming };
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

  it('calls onToggle with the reminder id when its category-check is clicked', () => {
    const { upcoming } = buildReminders();
    const props = defaultProps();
    render(<AgendaReminderPanel reminders={[upcoming]} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(props.onToggle).toHaveBeenCalledWith('upcoming-1');
  });
});
