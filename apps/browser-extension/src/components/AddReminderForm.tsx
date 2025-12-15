import {
  createScheduledDate,
  logger,
  type ReminderCategory,
  type ReminderTemplate,
  suggestOptimalTime,
} from '@cuewise/shared';
import { LayoutTemplate, PenLine } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useReminderStore } from '../stores/reminder-store';
import { useToastStore } from '../stores/toast-store';
import { DateTimePresetPicker } from './DateTimePresetPicker';
import { ReminderTemplateGrid } from './ReminderTemplateGrid';

type FormMode = 'custom' | 'template';

interface AddReminderFormProps {
  onSuccess: () => void;
}

export const AddReminderForm: React.FC<AddReminderFormProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<FormMode>('template');
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    'daily'
  );
  const [category, setCategory] = useState<ReminderCategory | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addReminder = useReminderStore((state) => state.addReminder);
  const reminders = useReminderStore((state) => state.reminders);

  // Compute suggested time based on completion patterns
  const suggestion = useMemo(() => {
    // Use category if set (from template), otherwise get general suggestion
    return suggestOptimalTime(reminders, category);
  }, [reminders, category]);

  // Handle template selection - pre-fill form and switch to custom mode
  const handleSelectTemplate = (template: ReminderTemplate) => {
    setText(template.text);
    setIsRecurring(true);
    setRecurringFrequency(template.frequency);
    setCategory(template.category);

    // Calculate the due date based on template's default time
    const [hours, minutes] = template.defaultTime.split(':').map(Number);
    setDueDate(createScheduledDate(hours, minutes));
    setMode('custom'); // Switch to custom mode to allow editing
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim() || !dueDate) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Validate that the date is in the future
      if (dueDate <= new Date()) {
        useToastStore.getState().warning('Please select a future date and time');
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
          : undefined,
        category
      );

      // Reset form
      setText('');
      setDueDate(null);
      setIsRecurring(false);
      setRecurringFrequency('daily');
      setCategory(undefined);

      onSuccess();
    } catch (error) {
      // This catch handles any unexpected errors not caught by the store
      logger.error('Unexpected error in reminder form submission', error);
      useToastStore.getState().error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setMode('template')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === 'template'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          <LayoutTemplate className="w-4 h-4" />
          Templates
        </button>
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === 'custom'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          <PenLine className="w-4 h-4" />
          Custom
        </button>
      </div>

      {/* Template Mode */}
      {mode === 'template' && <ReminderTemplateGrid onSelectTemplate={handleSelectTemplate} />}

      {/* Custom Mode - Form */}
      {mode === 'custom' && (
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

          {/* Date and Time Picker */}
          <DateTimePresetPicker
            value={dueDate}
            onChange={setDueDate}
            label="When"
            required
            suggestion={suggestion}
          />

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

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="submit"
              disabled={!text.trim() || !dueDate || isSubmitting}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow-md"
            >
              {isSubmitting ? 'Adding...' : 'Add Reminder'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
