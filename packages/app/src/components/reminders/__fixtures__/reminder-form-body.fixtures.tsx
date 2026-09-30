import { fireEvent, render, screen } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { ReminderFormBody } from '../ReminderFormBody';

type Recurring = NonNullable<React.ComponentProps<typeof ReminderFormBody>['initial']>['recurring'];

/** The edit form for an existing reminder; answers its submit spy. */
export function renderEdit(recurring: Recurring) {
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

/** Submits the form and answers the recurrence it saved. */
export async function submitted(onSubmit: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => {
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  return onSubmit.mock.calls[0][0].recurring;
}
