import {
  formatDate,
  type Goal,
  getDateStringDaysFromNow,
  getNextDayDateString,
  getTodayDateString,
} from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { CalendarDays } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGoalStore } from '../../stores/goal-store';

interface GoalFormProps {
  goal?: Goal; // If provided, edit mode
  onCancel: () => void;
  onSuccess: () => void;
}

const eyebrowClass = 'block text-xs font-semibold uppercase tracking-wider text-secondary';

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary placeholder:text-secondary';

const chipClass = (active: boolean): string =>
  cn(
    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
    active
      ? 'border-transparent bg-primary-600 text-white'
      : 'border-border bg-surface text-secondary hover:bg-surface-variant hover:text-primary'
  );

const DUE_PRESETS: { label: string; value: () => string }[] = [
  { label: 'Today', value: getTodayDateString },
  { label: 'Tomorrow', value: getNextDayDateString },
  { label: 'Next week', value: () => getDateStringDaysFromNow(7) },
  { label: 'In 2 weeks', value: () => getDateStringDaysFromNow(14) },
];

// Relative descriptor for the preview: "today" / "tomorrow" / "in 9 days" / "in 2 weeks" / "overdue".
function relativeDue(dueDate: string): string {
  const dayMs = 86_400_000;
  const startOfDay = (value: string): number => new Date(`${value}T00:00:00`).getTime();
  const diff = Math.round((startOfDay(dueDate) - startOfDay(getTodayDateString())) / dayMs);
  if (diff < 0) {
    return 'overdue';
  }
  if (diff === 0) {
    return 'today';
  }
  if (diff === 1) {
    return 'tomorrow';
  }
  if (diff < 14) {
    return `in ${diff} days`;
  }
  const weeks = Math.round(diff / 7);
  return `in ${weeks} weeks`;
}

export const GoalForm: React.FC<GoalFormProps> = ({ goal, onCancel, onSuccess }) => {
  const addGoal = useGoalStore((state) => state.addGoal);
  const updateGoal = useGoalStore((state) => state.updateGoal);

  const [title, setTitle] = useState(goal?.text ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  // Default new goals to two weeks out.
  const [dueDate, setDueDate] = useState(() => goal?.date ?? getDateStringDaysFromNow(14));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = !!goal;

  // Focus the title input when the form mounts.
  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, []);

  const isValid = title.trim().length > 0 && dueDate.length > 0;
  const today = getTodayDateString();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    let success: boolean;
    if (isEditMode && goal) {
      success = await updateGoal(goal.id, {
        text: title.trim(),
        description: description.trim() || undefined,
        date: dueDate,
      });
    } else {
      success = await addGoal(title.trim(), dueDate, description.trim() || undefined);
    }

    setIsSubmitting(false);

    if (success) {
      onSuccess();
    }
    // On failure, keep the form open so the user can retry.
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div>
        <label htmlFor="goal-title" className={cn(eyebrowClass, 'mb-1.5')}>
          Title <span className="text-red-400">*</span>
        </label>
        <input
          ref={titleInputRef}
          id="goal-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you want to achieve?"
          className={inputClass}
          maxLength={200}
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="goal-description" className={cn(eyebrowClass, 'mb-1.5')}>
          Description{' '}
          <span className="font-normal normal-case tracking-normal text-secondary">(optional)</span>
        </label>
        <textarea
          id="goal-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add more details about this goal..."
          className={cn(inputClass, 'resize-none')}
          rows={2}
          maxLength={500}
        />
      </div>

      {/* Due date */}
      <div className="space-y-2.5">
        <span className={eyebrowClass}>
          Due date <span className="text-red-400">*</span>
        </span>

        <div className="flex flex-wrap gap-2">
          {DUE_PRESETS.map((preset) => {
            const value = preset.value();
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => setDueDate(value)}
                className={chipClass(dueDate === value)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <input
          id="goal-duedate"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          min={today}
          className={cn(inputClass, 'dark:[color-scheme:dark]')}
        />

        <p className="flex items-center gap-1.5 text-xs text-secondary">
          <CalendarDays className="w-3.5 h-3.5 flex-none" />
          {dueDate
            ? `${formatDate(dueDate)} · ${relativeDue(dueDate)}`
            : 'When do you want to complete this goal?'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-primary rounded-lg hover:bg-surface-variant transition-colors font-medium"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-sm hover:shadow-md"
        >
          {isSubmitting
            ? isEditMode
              ? 'Saving...'
              : 'Creating...'
            : isEditMode
              ? 'Save Changes'
              : 'Create Goal'}
        </button>
      </div>
    </form>
  );
};
