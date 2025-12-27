import { type Goal, getTodayDateString } from '@cuewise/shared';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGoalStore } from '../../stores/goal-store';

interface GoalFormProps {
  objective?: Goal; // If provided, edit mode
  onCancel: () => void;
  onSuccess: () => void;
}

export const GoalForm: React.FC<GoalFormProps> = ({ objective, onCancel, onSuccess }) => {
  const addObjective = useGoalStore((state) => state.addObjective);
  const updateObjective = useGoalStore((state) => state.updateObjective);

  // Default to 2 weeks from now for new goals
  const defaultDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split('T')[0];
  };

  const [title, setTitle] = useState(objective?.text ?? '');
  const [description, setDescription] = useState(objective?.description ?? '');
  const [dueDate, setDueDate] = useState(objective?.date ?? defaultDate());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = !!objective;

  // Focus the title input when the form mounts
  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, []);
  const isValid = title.trim().length > 0 && dueDate.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditMode && objective) {
        await updateObjective(objective.id, {
          text: title.trim(),
          description: description.trim() || undefined,
          date: dueDate,
        });
      } else {
        await addObjective(title.trim(), dueDate, description.trim() || undefined);
      }
      onSuccess();
    } finally {
      setIsSubmitting(false);
    }
  };

  const today = getTodayDateString();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div>
        <label htmlFor="goal-title" className="block text-sm font-medium text-primary mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          ref={titleInputRef}
          id="goal-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you want to achieve?"
          className="w-full px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary placeholder:text-secondary"
          maxLength={200}
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="goal-description" className="block text-sm font-medium text-primary mb-1">
          Description <span className="text-secondary">(optional)</span>
        </label>
        <textarea
          id="goal-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add more details about this goal..."
          className="w-full px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary placeholder:text-secondary resize-none"
          rows={3}
          maxLength={500}
        />
      </div>

      {/* Due Date */}
      <div>
        <label htmlFor="goal-duedate" className="block text-sm font-medium text-primary mb-1">
          Due Date <span className="text-red-500">*</span>
        </label>
        <input
          id="goal-duedate"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          min={today}
          className="w-full px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary"
        />
        <p className="text-xs text-secondary mt-1">When do you want to complete this goal?</p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-secondary hover:text-primary transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
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
