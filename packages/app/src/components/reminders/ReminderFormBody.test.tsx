import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReminderFormBody } from './ReminderFormBody';

type Recurring = NonNullable<React.ComponentProps<typeof ReminderFormBody>['initial']>['recurring'];

function renderEdit(recurring: Recurring) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <ReminderFormBody
      initial={{ text: 'Drink water', dueDate: new Date().toISOString(), recurring }}
      submitLabel="Save"
      mode="edit"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />
  );
  return onSubmit;
}

async function submitted(onSubmit: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => {
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  return onSubmit.mock.calls[0][0].recurring;
}

describe('ReminderFormBody active hours', () => {
  it('leaves an existing interval reminder without a window running around the clock', async () => {
    const onSubmit = renderEdit({ frequency: 'interval', intervalMinutes: 30 });

    expect(await submitted(onSubmit)).toEqual({ frequency: 'interval', intervalMinutes: 30 });
  });

  it('pre-fills the window an interval reminder already has', () => {
    renderEdit({
      frequency: 'interval',
      intervalMinutes: 60,
      activeHours: { start: '08:30', end: '17:00', days: [1, 2, 3, 4, 5] },
    });

    expect(screen.getByLabelText('From')).toHaveValue('08:30');
    expect(screen.getByLabelText('To')).toHaveValue('17:00');
    expect(screen.getByText(/Weekdays/)).toBeInTheDocument();
  });

  it('stores only the days left selected', async () => {
    const onSubmit = renderEdit({
      frequency: 'interval',
      intervalMinutes: 60,
      activeHours: { start: '09:00', end: '18:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sunday' }));

    expect((await submitted(onSubmit)).activeHours).toEqual({
      start: '09:00',
      end: '18:00',
      days: [1, 2, 3, 4, 5],
    });
  });

  it('keeps the last selected day on', () => {
    renderEdit({
      frequency: 'interval',
      intervalMinutes: 60,
      activeHours: { start: '09:00', end: '18:00', days: [3] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Wednesday' }));

    expect(screen.getByRole('button', { name: 'Wednesday' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
