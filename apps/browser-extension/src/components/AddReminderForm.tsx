import type React from 'react';
import { useState } from 'react';
import { useReminderStore } from '../stores/reminder-store';

interface AddReminderFormProps {
  onSuccess: () => void;
}

export const AddReminderForm: React.FC<AddReminderFormProps> = ({ onSuccess }) => {
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    'daily'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addReminder = useReminderStore((state) => state.addReminder);

  // Set default date and time to current + 1 hour
  const initializeDefaultDateTime = () => {
    if (!date) {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
      setDate(tomorrow.toISOString().split('T')[0]);
      setTime(
        `${tomorrow.getHours().toString().padStart(2, '0')}:${tomorrow.getMinutes().toString().padStart(2, '0')}`
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim() || !date || !time) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Combine date and time into a Date object
      const dueDate = new Date(`${date}T${time}`);

      // Validate that the date is in the future
      if (dueDate <= new Date()) {
        alert('Please select a future date and time');
        setIsSubmitting(false);
        return;
      }

      await addReminder(
        text.trim(),
        dueDate,
        isRecurring
          ? {
              frequency: recurringFrequency,
              enabled: true,
            }
          : undefined
      );

      // Reset form
      setText('');
      setDate('');
      setTime('');
      setIsRecurring(false);
      setRecurringFrequency('daily');

      onSuccess();
    } catch (error) {
      console.error('Failed to add reminder:', error);
      alert('Failed to add reminder. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Reminder Text */}
      <div>
        <label htmlFor="reminder-text" className="block text-sm font-medium text-gray-700 mb-2">
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
          className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors resize-none"
        />
        <p className="mt-1 text-xs text-gray-500">{text.length}/200 characters</p>
      </div>

      {/* Date and Time */}
      <div className="grid grid-cols-2 gap-4">
        {/* Date */}
        <div>
          <label htmlFor="reminder-date" className="block text-sm font-medium text-gray-700 mb-2">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            id="reminder-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onFocus={initializeDefaultDateTime}
            required
            min={new Date().toISOString().split('T')[0]}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Time */}
        <div>
          <label htmlFor="reminder-time" className="block text-sm font-medium text-gray-700 mb-2">
            Time <span className="text-red-500">*</span>
          </label>
          <input
            id="reminder-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onFocus={initializeDefaultDateTime}
            required
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors"
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
            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <label htmlFor="reminder-recurring" className="ml-2 text-sm font-medium text-gray-700">
            Repeat this reminder
          </label>
        </div>

        {/* Frequency Selector (only shown when recurring is enabled) */}
        {isRecurring && (
          <div className="ml-6">
            <label
              htmlFor="reminder-frequency"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Frequency
            </label>
            <select
              id="reminder-frequency"
              value={recurringFrequency}
              onChange={(e) =>
                setRecurringFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')
              }
              className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="submit"
          disabled={!text.trim() || !date || !time || isSubmitting}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow-md"
        >
          {isSubmitting ? 'Adding...' : 'Add Reminder'}
        </button>
      </div>
    </form>
  );
};
