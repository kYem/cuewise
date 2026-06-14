import {
  clampIntervalMinutes,
  createScheduledDate,
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  intervalDueDateFromNow,
  logger,
  type ReminderTemplate,
} from '@cuewise/shared';
import { LayoutTemplate, PenLine } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useReminderStore } from '../stores/reminder-store';
import { useToastStore } from '../stores/toast-store';
import { ReminderTemplateGrid } from './ReminderTemplateGrid';
import { ReminderFormBody } from './reminders/ReminderFormBody';

type FormMode = 'custom' | 'template';

interface AddReminderFormProps {
  onSuccess: () => void;
}

export const AddReminderForm: React.FC<AddReminderFormProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<FormMode>('template');

  const addReminder = useReminderStore((state) => state.addReminder);

  // Handle template selection - create reminder directly
  const handleSelectTemplate = async (template: ReminderTemplate) => {
    // Interval templates (e.g. "Move") fire one interval out from now.
    if (template.frequency === 'interval') {
      const minutes = clampIntervalMinutes(
        template.intervalMinutes ?? DEFAULT_REMINDER_INTERVAL_MINUTES
      );
      try {
        const created = await addReminder(
          template.text,
          intervalDueDateFromNow(minutes),
          { frequency: 'interval', intervalMinutes: minutes },
          template.category
        );
        // Store already toasts the error on a failed write; only confirm on success.
        if (created) {
          useToastStore.getState().success(`Created "${template.name}" reminder`);
          onSuccess();
        }
      } catch (error) {
        logger.error('Failed to create reminder from template', error);
        useToastStore.getState().error('Failed to create reminder. Please try again.');
      }
      return;
    }

    // Validate time format
    const timeParts = template.defaultTime?.split(':');
    if (!timeParts || timeParts.length !== 2) {
      logger.error('Invalid template time format', {
        templateId: template.id,
        defaultTime: template.defaultTime,
      });
      useToastStore.getState().warning('Template has invalid time format');
      return;
    }

    const hours = Number(timeParts[0]);
    const minutes = Number(timeParts[1]);

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      logger.error('Invalid template time values', {
        templateId: template.id,
        hours,
        minutes,
      });
      useToastStore.getState().warning('Template has invalid time values');
      return;
    }

    // Create reminder directly from template
    try {
      const dueDate = createScheduledDate(hours, minutes);

      const created = await addReminder(
        template.text,
        dueDate,
        {
          frequency: template.frequency,
        },
        template.category
      );

      // Store already toasts the error on a failed write; only confirm on success.
      if (created) {
        useToastStore.getState().success(`Created "${template.name}" reminder`);
        onSuccess();
      }
    } catch (error) {
      logger.error('Failed to create reminder from template', error);
      useToastStore.getState().error('Failed to create reminder. Please try again.');
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
        <ReminderFormBody
          submitLabel="Add reminder"
          mode="add"
          onCancel={onSuccess}
          onSubmit={async ({ text, dueDate, recurring }) => {
            // Close the modal only on a successful write; the store toasts on failure.
            const created = await addReminder(text, dueDate, recurring, undefined);
            if (created) {
              onSuccess();
            }
          }}
        />
      )}
    </div>
  );
};
