import { getRelativeDateLabel, getTodayDateString } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { ArrowRight, Calendar, CheckCircle2, Circle, MoveRight, Trash2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';

export const AllGoalsList: React.FC = () => {
  const {
    getFilteredGoalsByDate,
    toggleGoal,
    updateGoal,
    deleteGoal,
    transferGoalToNextDay,
    moveGoalToToday,
    completionFilter,
  } = useGoalStore();
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const groupedGoals = getFilteredGoalsByDate();
  const today = getTodayDateString();

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
    if (editingGoalId && editText.trim()) {
      const currentGoal = groupedGoals
        .flatMap((g) => g.goals)
        .find((goal) => goal.id === editingGoalId);

      if (currentGoal && editText.trim() !== currentGoal.text) {
        await updateGoal(editingGoalId, editText.trim());
      }
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

  if (groupedGoals.length === 0) {
    const emptyMessage =
      completionFilter === 'completed'
        ? 'No completed goals yet'
        : completionFilter === 'incomplete'
          ? 'No incomplete goals'
          : 'No goals found';

    return (
      <div className="text-center py-12">
        <Calendar className="w-16 h-16 mx-auto mb-4 text-tertiary" />
        <p className="text-lg text-secondary mb-2">{emptyMessage}</p>
        <p className="text-sm text-tertiary">
          {completionFilter === 'completed'
            ? 'Complete some goals to see them here!'
            : 'Start adding goals to track your progress'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-6">
      {groupedGoals.map(({ date, goals }) => {
        const dateLabel = getRelativeDateLabel(date);
        const isToday = date === today;
        const goalCount = goals.length;

        return (
          <div key={date} className="space-y-3">
            {/* Date Header */}
            <div className="flex items-center gap-3">
              <div className={cn('flex-1 h-px', isToday ? 'bg-primary-300' : 'bg-divider')} />
              <div className="flex items-center gap-2">
                <Calendar
                  className={cn('w-4 h-4', isToday ? 'text-primary-600' : 'text-tertiary')}
                />
                <h3
                  className={cn(
                    'text-sm font-semibold',
                    isToday ? 'text-primary-600' : 'text-secondary'
                  )}
                >
                  {dateLabel}
                </h3>
                <span className="text-xs text-tertiary">
                  ({goalCount} {goalCount === 1 ? 'goal' : 'goals'})
                </span>
              </div>
              <div className={cn('flex-1 h-px', isToday ? 'bg-primary-300' : 'bg-divider')} />
            </div>

            {/* Goals for this date */}
            <div className="space-y-2">
              {goals.map((goal) => (
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
                    <div className="flex-1 flex items-center gap-2">
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
                      {/* Transfer count badge */}
                      {goal.transferCount && goal.transferCount > 0 && (
                        <span
                          className="flex-shrink-0 text-xs text-tertiary"
                          title={`Transferred ${goal.transferCount} time${goal.transferCount > 1 ? 's' : ''}`}
                        >
                          ↻{goal.transferCount}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Move to Today Button - only show for non-today goals */}
                  {!isToday && (
                    <button
                      type="button"
                      onClick={() => moveGoalToToday(goal.id)}
                      className="flex-shrink-0 p-2 text-secondary hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
                      aria-label="Move to today"
                      title="Move to today"
                    >
                      <MoveRight className="w-4 h-4" />
                    </button>
                  )}

                  {/* Transfer to Tomorrow Button - only show for today's incomplete goals */}
                  {isToday && !goal.completed && (
                    <button
                      type="button"
                      onClick={() => transferGoalToNextDay(goal.id)}
                      className="flex-shrink-0 p-2 text-secondary hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
                      aria-label="Transfer to tomorrow"
                      title="Transfer to tomorrow"
                    >
                      <ArrowRight className="w-4 h-4" />
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
          </div>
        );
      })}
    </div>
  );
};
