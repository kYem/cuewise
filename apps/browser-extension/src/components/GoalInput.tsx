import { Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { Check, Flag, Link2, Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';

interface GoalInputProps {
  defaultGoalId?: string;
  onTaskAdded?: () => void;
  autoFocus?: boolean;
}

export const GoalInput: React.FC<GoalInputProps> = ({
  defaultGoalId,
  onTaskAdded,
  autoFocus = false,
}) => {
  const [text, setText] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(defaultGoalId ?? null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addTask = useGoalStore((state) => state.addTask);
  const getActiveGoals = useGoalStore((state) => state.getActiveGoals);
  const getGoalProgress = useGoalStore((state) => state.getGoalProgress);

  const activeGoals = getActiveGoals();
  const hasGoals = activeGoals.length > 0;
  const selectedGoal = activeGoals.find((o) => o.id === selectedGoalId);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      const success = await addTask(text, selectedGoalId ?? undefined);
      if (success) {
        setText('');
        if (!defaultGoalId) {
          setSelectedGoalId(null);
        }
        if (onTaskAdded) {
          onTaskAdded();
        }
      }
      // On failure, keep text in input so user can retry
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        const success = await addTask(text, selectedGoalId ?? undefined);
        if (success) {
          setText('');
          if (!defaultGoalId) {
            setSelectedGoalId(null);
          }
          if (onTaskAdded) {
            onTaskAdded();
          }
        }
        // On failure, keep text in input so user can retry
      }
    }
  };

  const handleGoalSelect = (goalId: string | null) => {
    setSelectedGoalId(goalId);
    setIsPickerOpen(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to focus on today?"
          className="flex-1 px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary placeholder:text-secondary"
          maxLength={200}
        />

        {/* Link to Goal button */}
        {hasGoals && (
          <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`p-3 rounded-lg border-2 transition-all ${
                  selectedGoalId
                    ? 'bg-primary-50 border-primary-500 text-primary-600'
                    : 'border-border text-secondary hover:border-primary-300 hover:text-primary-500'
                }`}
                title={
                  selectedGoalId ? `Linked to: ${selectedGoal?.text ?? 'Goal'}` : 'Link to goal'
                }
              >
                <Link2 className="w-5 h-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="min-w-[220px] py-1 bg-surface/95 backdrop-blur-xl">
              {/* No goal option */}
              <button
                type="button"
                onClick={() => handleGoalSelect(null)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-variant ${
                  !selectedGoalId ? 'bg-primary-50 text-primary-700 font-medium' : 'text-primary'
                }`}
              >
                <span className="flex-1">No goal</span>
                {!selectedGoalId && <Check className="w-4 h-4 text-primary-600" />}
              </button>

              {/* Divider */}
              <div className="border-t border-border my-1" />

              {/* Goal options */}
              {activeGoals.map((goal) => {
                const progress = getGoalProgress(goal.id);
                const percent = progress?.percent ?? 0;
                const isSelected = selectedGoalId === goal.id;

                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => handleGoalSelect(goal.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-variant ${
                      isSelected ? 'bg-primary-50 text-primary-700 font-medium' : 'text-primary'
                    }`}
                  >
                    <Flag className="w-4 h-4 text-primary-600 flex-shrink-0" />
                    <span className="flex-1 truncate">{goal.text}</span>
                    <span className="text-xs text-secondary flex-shrink-0">{percent}%</span>
                    {isSelected && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        )}

        <button
          type="submit"
          disabled={!text.trim()}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium shadow-sm hover:shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Add</span>
        </button>
      </div>

      {/* Show selected goal as small indicator */}
      {selectedGoalId && selectedGoal && (
        <div className="flex items-center gap-1 text-xs text-primary-600">
          <Link2 className="w-3 h-3" />
          <span>Will link to: {selectedGoal.text}</span>
          <button
            type="button"
            onClick={() => setSelectedGoalId(null)}
            className="ml-1 text-secondary hover:text-primary underline"
          >
            Remove
          </button>
        </div>
      )}
    </form>
  );
};
