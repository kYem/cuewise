import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReminderStore } from '../stores/reminder-store';
import { AddReminderForm } from './AddReminderForm';

vi.mock('../stores/reminder-store', () => ({
  useReminderStore: vi.fn(),
}));

// The form reads only `addReminder` via selector — return it for any selector.
function mockAddReminder() {
  const addReminder = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useReminderStore).mockImplementation((selector) =>
    selector({ addReminder } as unknown as Parameters<typeof selector>[0])
  );
  return addReminder;
}

function openCustomTab() {
  fireEvent.click(screen.getByRole('button', { name: /Custom/ }));
}

describe('AddReminderForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
