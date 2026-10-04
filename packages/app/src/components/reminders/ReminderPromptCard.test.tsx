import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REMINDER_DONE_BUTTON,
  REMINDER_SNOOZE_BUTTON,
  respondToReminder,
} from '../../services/reminder-notifications';
import { removeReminderPrompt } from '../../services/reminder-prompts';
import { useReminderStore } from '../../stores/reminder-store';
import { useToastStore } from '../../stores/toast-store';
import {
  firedReminders,
  setTabVisibility,
  stretch,
  water,
} from '../__fixtures__/reminder-prompt-card.fixtures';
import { ReminderPromptCard } from './ReminderPromptCard';

vi.mock('../../services/reminder-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/reminder-notifications')>()),
  respondToReminder: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../../services/reminder-prompts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/reminder-prompts')>()),
  removeReminderPrompt: vi.fn(() => Promise.resolve(true)),
}));
const respond = vi.mocked(respondToReminder);
const removePrompt = vi.mocked(removeReminderPrompt);

beforeEach(() => {
  vi.clearAllMocks();
  setTabVisibility('visible');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReminderPromptCard', () => {
  it('shows the reminder that fired', () => {
    firedReminders(stretch);

    render(<ReminderPromptCard />);

    expect(screen.getByRole('region', { name: 'Stretch' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Stretch');
  });

  it('names the cadence of a recurring reminder', () => {
    firedReminders(water);

    render(<ReminderPromptCard />);

    expect(screen.getByRole('alert')).toHaveTextContent('daily');
  });

  it('shows one card at a time, the oldest prompt first', () => {
    firedReminders(water, stretch);

    render(<ReminderPromptCard />);

    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Drink water');
  });

  it('stays out of a background tab, and appears once the tab is shown', () => {
    setTabVisibility('hidden');
    firedReminders(stretch);
    render(<ReminderPromptCard />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => setTabVisibility('visible'));

    expect(screen.getByRole('alert')).toHaveTextContent('Stretch');
  });

  it('steps aside while the bell panel is open', () => {
    firedReminders(stretch);

    render(<ReminderPromptCard hidden />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lapses once the reminder was answered or moved somewhere else', () => {
    firedReminders(water);
    useReminderStore.setState({
      reminders: [{ ...water, dueDate: '2030-01-01T09:00:00.000Z' }],
    });

    render(<ReminderPromptCard />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lapses for a reminder paused since it fired', () => {
    firedReminders(water);
    useReminderStore.setState({ reminders: [{ ...water, paused: true }] });

    render(<ReminderPromptCard />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('answers Done the way the notification does', async () => {
    firedReminders(stretch);
    render(<ReminderPromptCard />);

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(respond).toHaveBeenCalledWith('r1', REMINDER_DONE_BUTTON);
  });

  it('snoozes by the length picked', async () => {
    firedReminders(stretch);
    render(<ReminderPromptCard />);

    await userEvent.click(screen.getByRole('button', { name: 'Snooze 15 minutes' }));

    expect(respond).toHaveBeenCalledWith('r1', REMINDER_SNOOZE_BUTTON, 15);
  });

  it('takes no second answer while the first is still saving', async () => {
    respond.mockImplementationOnce(() => new Promise(() => {}));
    firedReminders(stretch);
    render(<ReminderPromptCard />);

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByRole('button', { name: 'Snooze 5 minutes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss reminder' })).toBeDisabled();
  });

  it('says so when the answer could not be saved', async () => {
    respond.mockResolvedValueOnce(false);
    const error = vi.spyOn(useToastStore.getState(), 'error');
    firedReminders(stretch);
    render(<ReminderPromptCard />);

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(error).toHaveBeenCalledWith('Could not update the reminder. Please try again.');
  });

  it('dismisses the card without answering the reminder', async () => {
    firedReminders(stretch);
    render(<ReminderPromptCard />);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss reminder' }));

    expect(removePrompt).toHaveBeenCalledWith('r1');
    expect(respond).not.toHaveBeenCalled();
  });

  it('dismisses on Escape from inside the card', () => {
    firedReminders(stretch);
    render(<ReminderPromptCard />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Done' }), { key: 'Escape' });

    expect(removePrompt).toHaveBeenCalledWith('r1');
  });
});
