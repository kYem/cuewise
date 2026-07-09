import { createSelectorMock, reminderFactory } from '@cuewise/test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReminderStore } from '../stores/reminder-store';
import { EditReminderForm } from './EditReminderForm';

vi.mock('../stores/reminder-store', () => ({
  useReminderStore: vi.fn(),
}));

// The form reads only `updateReminder` via selector — return it for any selector.
// Resolves true: onSuccess() is now gated on a successful write.
function mockUpdateReminder() {
  const updateReminder = vi.fn().mockResolvedValue(true);
  vi.mocked(useReminderStore).mockImplementation(createSelectorMock({ updateReminder }));
  return updateReminder;
}

function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

describe('EditReminderForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the existing reminder text and a Save button', () => {
    mockUpdateReminder();
    const reminder = reminderFactory.build({ text: 'Drink water' });

    render(<EditReminderForm reminder={reminder} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByDisplayValue('Drink water')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save reminder' })).toBeInTheDocument();
  });

  it('fills the date input to tomorrow when the Tomorrow starts chip is clicked', () => {
    mockUpdateReminder();
    const reminder = reminderFactory.build();

    render(<EditReminderForm reminder={reminder} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));

    const dateInput = screen.getByLabelText('Date');
    expect(dateInput).toHaveValue(tomorrowDateString());
  });

  it('submits with recurring undefined after toggling Repeat off', async () => {
    const updateReminder = mockUpdateReminder();
    const onSuccess = vi.fn();
    const reminder = reminderFactory.build({
      text: 'Stretch',
      recurring: { frequency: 'daily' },
    });

    render(<EditReminderForm reminder={reminder} onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Repeat this reminder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save reminder' }));

    await vi.waitFor(() => {
      expect(updateReminder).toHaveBeenCalledWith(
        reminder.id,
        expect.objectContaining({ recurring: undefined, paused: undefined })
      );
    });
  });
});
