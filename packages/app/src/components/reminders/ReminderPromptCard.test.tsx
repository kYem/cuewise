import { recurringReminderFactory, reminderFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REMINDER_DONE_BUTTON,
  REMINDER_SNOOZE_BUTTON,
  respondToReminder,
} from '../../services/reminder-notifications';
import { removeReminderPrompt } from '../../services/reminder-prompts';
import { useReminderPromptStore } from '../../stores/reminder-prompt-store';
import { useReminderStore } from '../../stores/reminder-store';
import { ReminderPromptCard } from './ReminderPromptCard';

vi.mock('../../services/reminder-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/reminder-notifications')>()),
  respondToReminder: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../services/reminder-prompts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/reminder-prompts')>()),
  removeReminderPrompt: vi.fn(() => Promise.resolve()),
}));
const respond = vi.mocked(respondToReminder);
const removePrompt = vi.mocked(removeReminderPrompt);

const stretch = reminderFactory.build({ id: 'r1', text: 'Stretch', completed: false });
const water = recurringReminderFactory.build({
  id: 'r2',
  text: 'Drink water',
  recurring: { frequency: 'daily' },
});

function showPrompts(ids: string[]): void {
  useReminderPromptStore.setState({
    prompts: ids.map((reminderId) => ({ reminderId, firedAt: '2026-10-04T09:00:00.000Z' })),
    initialize: async () => {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  useReminderStore.setState({ reminders: [stretch, water] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReminderPromptCard', () => {
  it('shows the reminder that fired', () => {
    showPrompts(['r1']);

    render(<ReminderPromptCard />);

    expect(screen.getByRole('alert')).toHaveTextContent('Stretch');
  });

  it('names the cadence of a recurring reminder', () => {
    showPrompts(['r2']);

    render(<ReminderPromptCard />);

    expect(screen.getByRole('alert')).toHaveTextContent('daily');
  });

  it('shows one card at a time, the oldest prompt first', () => {
    showPrompts(['r2', 'r1']);

    render(<ReminderPromptCard />);

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Drink water');
  });

  it('stays out of a tab that is not in front of the user', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    showPrompts(['r1']);

    render(<ReminderPromptCard />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('steps aside while the bell panel is open', () => {
    showPrompts(['r1']);

    render(<ReminderPromptCard hidden />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows nothing for a reminder that is gone or already done', () => {
    useReminderStore.setState({ reminders: [{ ...stretch, completed: true }] });
    showPrompts(['r1', 'gone']);

    render(<ReminderPromptCard />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('answers Done the way the notification does', async () => {
    showPrompts(['r1']);
    render(<ReminderPromptCard />);

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(respond).toHaveBeenCalledWith('r1', REMINDER_DONE_BUTTON);
  });

  it('snoozes by the length picked', async () => {
    showPrompts(['r1']);
    render(<ReminderPromptCard />);

    await userEvent.click(screen.getByRole('button', { name: '15m' }));

    expect(respond).toHaveBeenCalledWith('r1', REMINDER_SNOOZE_BUTTON, 15);
  });

  it('dismisses the card without answering the reminder', async () => {
    showPrompts(['r1']);
    render(<ReminderPromptCard />);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss reminder' }));

    expect(removePrompt).toHaveBeenCalledWith('r1');
    expect(respond).not.toHaveBeenCalled();
  });
});
