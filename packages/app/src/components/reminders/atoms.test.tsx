import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RecurrencePauseControl,
  ReminderCategoryCheck,
  ReminderHeroCard,
  ReminderPanelHeader,
} from './atoms';

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

describe('RecurrencePauseControl', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows today’s progress next to the cadence of an interval with a daily target', () => {
    const reminder = recurringReminderFactory.build({
      recurring: { frequency: 'interval', intervalMinutes: 60, dailyTarget: 3 },
      doneToday: { date: '2026-06-15', count: 1 },
    });
    render(<RecurrencePauseControl reminder={reminder} onPauseToggle={vi.fn()} />);

    expect(screen.getByText('· 1/3 today')).toHaveAttribute('aria-hidden', 'true');
  });

  it('spells out today’s progress for screen readers', () => {
    const reminder = recurringReminderFactory.build({
      recurring: { frequency: 'interval', intervalMinutes: 60, dailyTarget: 3 },
      doneToday: { date: '2026-06-15', count: 1 },
    });
    render(<RecurrencePauseControl reminder={reminder} onPauseToggle={vi.fn()} />);

    expect(screen.getByText('1 of 3 done today')).toHaveClass('sr-only');
  });

  it('shows only the cadence of an interval without a daily target', () => {
    const reminder = recurringReminderFactory.build({
      recurring: { frequency: 'interval', intervalMinutes: 60 },
    });
    render(<RecurrencePauseControl reminder={reminder} onPauseToggle={vi.fn()} />);

    expect(screen.getByText('every 60 min')).toBeInTheDocument();
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

  it('exposes the unpin label and unpins when already pinned', () => {
    const onChange = vi.fn();
    render(
      <ReminderPanelHeader count={0} hasUrgent={false} pinToggle={{ pinned: true, onChange }} />
    );

    const pin = screen.getByRole('button', { name: 'Unpin reminders panel' });
    expect(pin).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(pin);
    expect(onChange).toHaveBeenCalledWith(false);
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

    fireEvent.click(screen.getByRole('button', { name: 'Snooze 5 minutes' }));
    expect(onSnooze).toHaveBeenCalledWith(5);
  });
});
