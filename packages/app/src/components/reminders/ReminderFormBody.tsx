import {
  buildReminderRecurring,
  clampIntervalMinutes,
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  formatCompactInterval,
  formatDateString,
  intervalDueDateFromNow,
  logger,
  type Reminder,
  type ReminderFrequency,
} from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { CalendarClock } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useToastStore } from '../../stores/toast-store';
import { IntervalCadencePicker } from '../IntervalCadencePicker';
import { Segmented, Switch } from '../settings/SettingControls';

export interface ReminderFormBodyProps {
  // Edit pre-fill; absent = blank (Add).
  initial?: { text: string; dueDate: string; recurring?: Reminder['recurring'] };
  submitLabel: string;
  // Add rejects a past one-time date/time; Edit accepts it (you may be fixing history).
  mode: 'add' | 'edit';
  onSubmit: (result: {
    text: string;
    dueDate: Date;
    recurring: Reminder['recurring'];
  }) => Promise<void>;
  onCancel: () => void;
}

const FREQUENCY_OPTIONS: { value: ReminderFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'interval', label: 'Interval' },
];

type PresetKind = 'hour' | 'evening' | 'tomorrow' | 'nextWeek';

const STARTS_PRESETS: { label: string; kind: PresetKind }[] = [
  { label: 'In 1 hour', kind: 'hour' },
  { label: 'Evening', kind: 'evening' },
  { label: 'Tomorrow', kind: 'tomorrow' },
  { label: 'Next week', kind: 'nextWeek' },
];

// A future Date for each quick-preset chip.
function presetDate(kind: PresetKind): Date {
  const d = new Date();
  if (kind === 'hour') {
    d.setHours(d.getHours() + 1);
  } else if (kind === 'evening') {
    if (d.getHours() >= 18) {
      d.setDate(d.getDate() + 1);
    }
    d.setHours(18, 0, 0, 0);
  } else if (kind === 'tomorrow') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else {
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
  }
  return d;
}

function toTimeString(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// "7:02 PM" from a "HH:MM" input value, or empty when unset.
function formatTimeLabel(time: string): string {
  if (!time) {
    return '';
  }
  const [hourStr, minuteStr] = time.split(':');
  const hours = Number(hourStr);
  const minutes = Number(minuteStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return '';
  }
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// "January 15" from a "YYYY-MM-DD" input value, or empty when unset.
function formatDateLabel(date: string): string {
  if (!date) {
    return '';
  }
  const [year, month, day] = date.split('-').map(Number);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return '';
  }
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
}

const chipClass = (active: boolean): string =>
  cn(
    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
    active
      ? 'border-transparent bg-primary-600 text-white'
      : 'border-border bg-surface text-secondary hover:bg-surface-variant hover:text-primary'
  );

const eyebrowClass = 'block text-xs font-semibold uppercase tracking-wider text-secondary';

/**
 * Polished reminder form body shared by the add and edit forms. Owns all form
 * state and validation; the parent wires persistence via `onSubmit`.
 */
export const ReminderFormBody: React.FC<ReminderFormBodyProps> = ({
  initial,
  submitLabel,
  mode,
  onSubmit,
  onCancel,
}) => {
  // Only Add enforces a future date; Edit may legitimately fix a past one-time time.
  const requireFuture = mode === 'add';
  // Derive initial date/time strings from a pre-fill, or leave blank for Add.
  const initialDate = initial ? new Date(initial.dueDate) : null;

  const [text, setText] = useState(initial?.text ?? '');
  const [date, setDate] = useState(initialDate ? formatDateString(initialDate) : '');
  const [time, setTime] = useState(initialDate ? toTimeString(initialDate) : '');
  const [isRecurring, setIsRecurring] = useState(initial?.recurring != null);
  const [recurringFrequency, setRecurringFrequency] = useState<ReminderFrequency>(
    initial?.recurring?.frequency ?? 'daily'
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    initial?.recurring?.frequency === 'interval'
      ? initial.recurring.intervalMinutes
      : DEFAULT_REMINDER_INTERVAL_MINUTES
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isInterval = isRecurring && recurringFrequency === 'interval';

  // Mirror a preset Date into the date + time input strings.
  const applyPreset = (kind: PresetKind) => {
    const d = presetDate(kind);
    setDate(formatDateString(d));
    setTime(toTimeString(d));
  };

  const schedulePreview = (() => {
    const timeLabel = formatTimeLabel(time) || 'the chosen time';
    if (isInterval) {
      const clamped = clampIntervalMinutes(intervalMinutes);
      return `Repeats every ${formatCompactInterval(clamped)} · starting now`;
    }
    if (isRecurring && recurringFrequency === 'daily') {
      return `Daily at ${timeLabel}`;
    }
    if (isRecurring && recurringFrequency === 'weekly') {
      return `Weekly at ${timeLabel}`;
    }
    if (isRecurring && recurringFrequency === 'monthly') {
      return `Monthly at ${timeLabel}`;
    }
    if (!date || !time) {
      return 'Pick a date & time';
    }
    return `One-time · ${formatDateLabel(date)} at ${formatTimeLabel(time)}`;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Interval reminders fire one interval out, so they don't need a picked date/time.
    if (!text.trim() || ((!date || !time) && !isInterval)) {
      return;
    }

    const clampedInterval = clampIntervalMinutes(intervalMinutes);
    // Interval reminders fire one interval out, not at the picked date/time.
    const dueDate = isInterval
      ? intervalDueDateFromNow(clampedInterval)
      : new Date(`${date}T${time}`);

    // Add rejects past one-time reminders. Interval reminders are exempt: they
    // roll forward to their next occurrence on fire, so a past first-occurrence
    // is harmless (and they always start one interval out anyway).
    if (requireFuture && !isInterval && dueDate <= new Date()) {
      useToastStore.getState().warning('Please select a future date and time');
      return;
    }

    const recurring = buildReminderRecurring(isRecurring, recurringFrequency, clampedInterval);

    setIsSubmitting(true);

    try {
      await onSubmit({ text: text.trim(), dueDate, recurring });
    } catch (error) {
      logger.error('Failed to submit reminder', error);
      useToastStore.getState().error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Reminder Text */}
      <div>
        <label htmlFor="reminder-text" className={cn(eyebrowClass, 'mb-2')}>
          Reminder <span className="text-red-400">*</span>
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

      {/* Starts — hidden for interval reminders, which fire one interval from now. */}
      {!isInterval && (
        <div className="space-y-3">
          <span className={eyebrowClass}>
            Starts <span className="text-red-400">*</span>
          </span>

          <div className="flex flex-wrap gap-2">
            {STARTS_PRESETS.map((preset) => (
              <button
                key={preset.kind}
                type="button"
                onClick={() => applyPreset(preset.kind)}
                className={chipClass(false)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="reminder-date"
                className="block text-xs font-medium text-secondary mb-1"
              >
                Date
              </label>
              <input
                id="reminder-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary dark:[color-scheme:dark]"
              />
            </div>

            <div>
              <label
                htmlFor="reminder-time"
                className="block text-xs font-medium text-secondary mb-1"
              >
                Time
              </label>
              <input
                id="reminder-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary dark:[color-scheme:dark]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Repeat toggle */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">Repeat</p>
          <p className="text-xs text-secondary">
            {isRecurring ? 'On — fires on a schedule' : 'Off — one-time reminder'}
          </p>
        </div>
        <Switch label="Repeat this reminder" checked={isRecurring} onChange={setIsRecurring} />
      </div>

      {/* Frequency (only when Repeat is on) */}
      {isRecurring && (
        <div className="space-y-3">
          <span className={eyebrowClass}>Frequency</span>
          <div className="flex">
            <Segmented
              value={recurringFrequency}
              options={FREQUENCY_OPTIONS}
              onChange={setRecurringFrequency}
            />
          </div>

          {isInterval && (
            <IntervalCadencePicker value={intervalMinutes} onChange={setIntervalMinutes} />
          )}
        </div>
      )}

      {/* Schedule preview */}
      <p className="flex items-center gap-1.5 text-xs text-secondary">
        <CalendarClock className="w-3.5 h-3.5 flex-none" />
        {schedulePreview}
      </p>

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 text-primary rounded-lg hover:bg-surface-variant transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!text.trim() || ((!date || !time) && !isInterval) || isSubmitting}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow-md"
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
};
