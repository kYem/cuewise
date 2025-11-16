import { cn } from '@cuewise/ui';
import { CheckCircle2, Circle, Trash2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';

export const GoalsList: React.FC = () => {
  const { todayGoals, toggleGoal, updateGoal, deleteGoal, isLoading } = useGoalStore();
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingGoalId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingGoalId]);

  const startEditing = (goalId: string, currentText: string) => {
    setEditingGoalId(goalId);
    setEditText(currentText);
  };

  const saveEdit = async () => {
    if (
      editingGoalId &&
      editText.trim() &&
      editText.trim() !== todayGoals.find((g) => g.id === editingGoalId)?.text
    ) {
      await updateGoal(editingGoalId, editText.trim());
    }
    setEditingGoalId(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingGoalId(null);
    setEditText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-secondary">Loading goals...</div>;
  }

  if (todayGoals.length === 0) {
    return (
      <div className="text-center py-8">
        <Circle className="w-16 h-16 mx-auto mb-4 text-tertiary" />
        <p className="text-lg text-secondary mb-2">No goals for today</p>
        <p className="text-sm text-tertiary">Add your first goal to get started!</p>
      </div>
    );
  }

  const completedCount = todayGoals.filter((g) => g.completed).length;
  const totalCount = todayGoals.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-secondary">
            <span>Progress</span>
            <span className="font-medium">
              {completedCount} of {totalCount} completed
            </span>
          </div>
          <div className="h-2 bg-divider rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-600 transition-all duration-500 ease-out rounded-full"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Goals List */}
      <div className="space-y-2">
        {todayGoals.map((goal) => (
          <div
            key={goal.id}
            className={cn(
              'group flex items-center gap-3 p-3 rounded-lg border-2 transition-all',
              goal.completed
                ? 'bg-surface-variant border-border'
                : 'bg-surface border-border hover:border-primary-300'
            )}
          >
            {/* Checkbox */}
            <button
              type="button"
              onClick={() => toggleGoal(goal.id)}
              className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-full"
              aria-label={goal.completed ? 'Mark as incomplete' : 'Mark as complete'}
            >
              {goal.completed ? (
                <CheckCircle2 className="w-6 h-6 text-primary-600" />
              ) : (
                <Circle className="w-6 h-6 text-tertiary group-hover:text-primary-500 transition-colors" />
              )}
            </button>

            {/* Goal Text */}
            {editingGoalId === goal.id ? (
              <input
                ref={inputRef}
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                maxLength={200}
                className="flex-1 text-base px-2 py-1 border-2 border-primary-500 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            ) : (
              <button
                type="button"
                onClick={() => startEditing(goal.id, goal.text)}
                className={cn(
                  'flex-1 text-base text-left transition-all hover:bg-surface-variant px-2 py-1 rounded',
                  goal.completed ? 'text-tertiary line-through' : 'text-primary'
                )}
              >
                {goal.text}
              </button>
            )}

            {/* Delete Button */}
            <button
              type="button"
              onClick={() => deleteGoal(goal.id)}
              className="flex-shrink-0 p-2 text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded"
              aria-label="Delete goal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Clear Completed Button */}
      {completedCount > 0 && (
        <button
          type="button"
          onClick={() => useGoalStore.getState().clearCompleted()}
          className="w-full py-2 text-sm text-secondary hover:text-primary transition-colors"
        >
          Clear {completedCount} completed {completedCount === 1 ? 'goal' : 'goals'}
        </button>
      )}
    </div>
  );
};
