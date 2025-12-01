import { logger, type Reminder } from '@cuewise/shared';
import type React from 'react';
import { useState } from 'react';
import { useReminderStore } from '../stores/reminder-store';

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
  // Parse the existing reminder's dueDate to extract date and time
  const existingDate = new Date(reminder.dueDate);
  const existingDateString = existingDate.toISOString().split('T')[0];
  const existingTimeString = `${existingDate.getHours().toString().padStart(2, '0')}:${existingDate.getMinutes().toString().padStart(2, '0')}`;

  const [text, setText] = useState(reminder.text);
  const [date, setDate] = useState(existingDateString);
  const [time, setTime] = useState(existingTimeString);
  const [isRecurring, setIsRecurring] = useState(reminder.recurring?.enabled ?? false);
  const [recurringFrequency, setRecurringFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    reminder.recurring?.frequency ?? 'daily'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateReminder = useReminderStore((state) => state.updateReminder);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim() || !date || !time) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Combine date and time into a Date object
      const dueDate = new Date(`${date}T${time}`);

      await updateReminder(reminder.id, {
        text: text.trim(),
        dueDate: dueDate.toISOString(),
        recurring: isRecurring
          ? {
              frequency: recurringFrequency,
              enabled: true,
            }
          : undefined,
      });

      onSuccess();
    } catch (error) {
      logger.error('Failed to update reminder', error);
      alert('Failed to update reminder. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Reminder Text */}
      <div>
        <label htmlFor="reminder-text" className="block text-sm font-medium text-primary mb-2">
          Reminder <span className="text-red-500">*</span>
        </label>
        <textarea
          id="reminder-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you want to be reminded about?"
          required
          rows={3}
          maxLength={200}
          className="w-full px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors resize-none text-primary placeholder:text-secondary"
        />
        <p className="mt-1 text-xs text-secondary">{text.length}/200 characters</p>
      </div>

      {/* Date and Time */}
      <div className="grid grid-cols-2 gap-4">
        {/* Date */}
        <div>
          <label htmlFor="reminder-date" className="block text-sm font-medium text-primary mb-2">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            id="reminder-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary"
          />
        </div>

        {/* Time */}
        <div>
          <label htmlFor="reminder-time" className="block text-sm font-medium text-primary mb-2">
            Time <span className="text-red-500">*</span>
          </label>
          <input
            id="reminder-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary"
          />
        </div>
      </div>

      {/* Recurring Option */}
      <div className="space-y-3">
        <div className="flex items-center">
          <input
            id="reminder-recurring"
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="w-4 h-4 text-primary-600 border-border rounded focus:ring-primary-500"
          />
          <label htmlFor="reminder-recurring" className="ml-2 text-sm font-medium text-primary">
            Repeat this reminder
          </label>
        </div>

        {/* Frequency Selector (only shown when recurring is enabled) */}
        {isRecurring && (
          <div className="ml-6">
            <label
              htmlFor="reminder-frequency"
              className="block text-sm font-medium text-primary mb-2"
            >
              Frequency
            </label>
            <select
              id="reminder-frequency"
              value={recurringFrequency}
              onChange={(e) =>
                setRecurringFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')
              }
              className="w-full px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        )}
      </div>

      {/* Submit and Cancel Buttons */}
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 bg-surface-variant text-primary rounded-lg hover:bg-border transition-all font-medium shadow-sm hover:shadow-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!text.trim() || !date || !time || isSubmitting}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow-md"
        >
          {isSubmitting ? 'Updating...' : 'Update Reminder'}
        </button>
      </div>
    </form>
  );
};
