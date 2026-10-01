import {
  DEFAULT_REMINDER_ACTIVE_HOURS,
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  firesPerActiveDay,
} from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReminderStore } from '../stores/reminder-store';
import { AddReminderForm } from './AddReminderForm';

vi.mock('../stores/reminder-store', () => ({
  useReminderStore: vi.fn(),
}));

// The form reads only `addReminder` via selector — return it for any selector.
// Resolves true: onSuccess() is now gated on a successful write.
function mockAddReminder() {
  const addReminder = vi.fn().mockResolvedValue(true);
  vi.mocked(useReminderStore).mockImplementation(createSelectorMock({ addReminder }));
  return addReminder;
}

function openCustomTab() {
  fireEvent.click(screen.getByRole('button', { name: /Custom/ }));
}

describe('AddReminderForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the shared form body when the Custom tab is selected', () => {
    mockAddReminder();

    render(<AddReminderForm onSuccess={vi.fn()} />);
    openCustomTab();

    expect(screen.getByText('Starts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add reminder' })).toBeInTheDocument();
  });

  it('calls addReminder with a future date when a valid custom reminder is submitted', async () => {
    const addReminder = mockAddReminder();
    const onSuccess = vi.fn();

    render(<AddReminderForm onSuccess={onSuccess} />);
    openCustomTab();

    fireEvent.change(screen.getByLabelText('Reminder *'), {
      target: { value: 'Call the dentist' },
    });
    // The "Next week" chip fills a guaranteed-future date and time.
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));

    await vi.waitFor(() => {
      expect(addReminder).toHaveBeenCalledTimes(1);
    });
    const [text, dueDate, recurring, category] = addReminder.mock.calls[0];
    expect(text).toBe('Call the dentist');
    expect(dueDate.getTime()).toBeGreaterThan(Date.now());
    expect(recurring).toBeUndefined();
    expect(category).toBeUndefined();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('does not call addReminder when a one-time custom reminder is set in the past', () => {
    const addReminder = mockAddReminder();

    render(<AddReminderForm onSuccess={vi.fn()} />);
    openCustomTab();

    fireEvent.change(screen.getByLabelText('Reminder *'), {
      target: { value: 'Past appointment' },
    });
    // Yesterday's date + a fixed time — guaranteed in the past, so Add must reject it.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateValue = `${yesterday.getFullYear()}-${(yesterday.getMonth() + 1).toString().padStart(2, '0')}-${yesterday.getDate().toString().padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: dateValue } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));

    expect(addReminder).not.toHaveBeenCalled();
  });

  it('creates Drink Water as an hourly reminder kept to the default active hours', async () => {
    const addReminder = mockAddReminder();

    render(<AddReminderForm onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Drink Water/ }));

    await vi.waitFor(() => {
      expect(addReminder).toHaveBeenCalledTimes(1);
    });
    expect(addReminder.mock.calls[0][2]).toEqual({
      frequency: 'interval',
      intervalMinutes: 60,
      activeHours: DEFAULT_REMINDER_ACTIVE_HOURS,
      dailyTarget: 8,
    });
  });

  it('shows an interval template’s active hours on its card', () => {
    mockAddReminder();

    render(<AddReminderForm onSuccess={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Drink Water/ })).toHaveTextContent(
      /Every 60 min · .+–.+/
    );
  });

  it('first fires a template created before its window at the window start', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 6, 0));
    const addReminder = mockAddReminder();

    render(<AddReminderForm onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Drink Water/ }));

    await vi.waitFor(() => {
      expect(addReminder).toHaveBeenCalledTimes(1);
    });
    expect(addReminder.mock.calls[0][1]).toEqual(new Date(2026, 9, 5, 9, 0));
  });

  it('keeps a new custom interval reminder to the default active hours', async () => {
    const addReminder = mockAddReminder();

    render(<AddReminderForm onSuccess={vi.fn()} />);
    openCustomTab();
    fireEvent.change(screen.getByLabelText('Reminder *'), { target: { value: 'Stretch' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Repeat this reminder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Interval' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));

    await vi.waitFor(() => {
      expect(addReminder).toHaveBeenCalledTimes(1);
    });
    expect(addReminder.mock.calls[0][2]).toMatchObject({
      frequency: 'interval',
      activeHours: DEFAULT_REMINDER_ACTIVE_HOURS,
    });
  });

  it('shows how many times a day the window allows', () => {
    mockAddReminder();

    render(<AddReminderForm onSuccess={vi.fn()} />);
    openCustomTab();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Repeat this reminder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Interval' }));

    const perDay = firesPerActiveDay(
      DEFAULT_REMINDER_INTERVAL_MINUTES,
      DEFAULT_REMINDER_ACTIVE_HOURS
    );
    expect(screen.getByText(new RegExp(`about ${perDay} a day`))).toBeInTheDocument();
  });

  it('lets a custom interval reminder run all day', async () => {
    const addReminder = mockAddReminder();

    render(<AddReminderForm onSuccess={vi.fn()} />);
    openCustomTab();
    fireEvent.change(screen.getByLabelText('Reminder *'), { target: { value: 'Stretch' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Repeat this reminder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Interval' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only during active hours' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));

    await vi.waitFor(() => {
      expect(addReminder).toHaveBeenCalledTimes(1);
    });
    expect(addReminder.mock.calls[0][2]).not.toHaveProperty('activeHours');
  });
});
