import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReminderCategoryCheck, ReminderHeroCard, ReminderPanelHeader } from './atoms';

describe('ReminderCategoryCheck', () => {
  it('calls onToggle when clicked', () => {
    const reminder = reminderFactory.build({ category: 'health' });
    const onToggle = vi.fn();
    render(<ReminderCategoryCheck reminder={reminder} state="upcoming" onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders the "Mark not done" control when completed', () => {
    const reminder = reminderFactory.build({ completed: true, category: 'health' });
    render(<ReminderCategoryCheck reminder={reminder} state="done" onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Mark not done' })).toBeInTheDocument();
  });

  it('shows a skip affordance for an upcoming recurring occurrence', () => {
    const reminder = recurringReminderFactory.build({
      category: 'health',
      dueDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      recurring: { frequency: 'interval', intervalMinutes: 30 },
    });
    render(<ReminderCategoryCheck reminder={reminder} state="upcoming" onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Skip to next occurrence' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
  });
});

describe('ReminderPanelHeader pin toggle', () => {
  it('renders the pin control and toggles the pinned value when clicked', () => {
    const onChange = vi.fn();
    render(
      <ReminderPanelHeader count={2} hasUrgent={false} pinToggle={{ pinned: false, onChange }} />
    );

    const pin = screen.getByRole('button', { name: 'Keep reminders open' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pin);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('exposes the unpin label and pressed state when already pinned', () => {
    render(
      <ReminderPanelHeader
        count={0}
        hasUrgent={false}
        pinToggle={{ pinned: true, onChange: vi.fn() }}
      />
    );

    const pin = screen.getByRole('button', { name: 'Unpin reminders panel' });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ReminderHeroCard', () => {
  it('renders the reminder text and snoozes for 5 minutes', () => {
    const reminder = recurringReminderFactory.build({
      text: 'Submit the quarterly report',
      category: 'productivity',
    });
    const onSnooze = vi.fn();
    render(
      <ReminderHeroCard
        reminder={reminder}
        state="soon"
        onToggle={vi.fn()}
        onSnooze={onSnooze}
        onPauseToggle={vi.fn()}
      />
    );

    expect(screen.getByText('Submit the quarterly report')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '5m' }));
    expect(onSnooze).toHaveBeenCalledWith(5);
  });
});
