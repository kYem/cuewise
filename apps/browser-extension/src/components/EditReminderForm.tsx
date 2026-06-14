import type { Reminder } from '@cuewise/shared';
import type React from 'react';
import { useReminderStore } from '../stores/reminder-store';
import { ReminderFormBody } from './reminders/ReminderFormBody';

interface EditReminderFormProps {
  reminder: Reminder;
  onSuccess: () => void;
  onCancel: () => void;
}

export const EditReminderForm: React.FC<EditReminderFormProps> = ({
  reminder,
  onSuccess,
  onCancel,
}) => {
  const updateReminder = useReminderStore((state) => state.updateReminder);

  return (
    <ReminderFormBody
      initial={{ text: reminder.text, dueDate: reminder.dueDate, recurring: reminder.recurring }}
      submitLabel="Save reminder"
      mode="edit"
      onCancel={onCancel}
      onSubmit={async ({ text, dueDate, recurring }) => {
        const saved = await updateReminder(reminder.id, {
          text,
          dueDate: dueDate.toISOString(),
          recurring,
          // Dropping recurrence must also drop a lingering paused flag — a one-off
          // reminder can't be paused, and the pause toggle is gated on `recurring`.
          ...(recurring ? {} : { paused: undefined }),
        });
        // Close the modal only on a successful write; the store toasts on failure.
        if (saved) {
          onSuccess();
        }
      }}
    />
  );
};
