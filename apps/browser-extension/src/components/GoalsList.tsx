import { isPastGoalTransferTime } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  History,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { type CompletionFilter, useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { AllGoalsList } from './AllGoalsList';

export const GoalsList: React.FC = () => {
  const {
    todayGoals,
    goals,
    showAllGoals,
    completionFilter,
    toggleGoal,
    updateGoal,
    deleteGoal,
    transferGoalToNextDay,
    toggleShowAllGoals,
    setCompletionFilter,
    isLoading,
  } = useGoalStore();
  const { settings } = useSettingsStore();
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if transfer button should be shown
  const showTransferButton =
    settings.enableGoalTransfer && isPastGoalTransferTime(settings.goalTransferTime);

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

  const completedCount = todayGoals.filter((g) => g.completed).length;
  const totalCount = todayGoals.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const hasOtherGoals = goals.length > todayGoals.length;

  return (
    <div className="space-y-4">
      {/* Empty State - Only show when no today's goals */}
      {todayGoals.length === 0 && (
        <div className="text-center py-8">
          <Circle className="w-16 h-16 mx-auto mb-4 text-tertiary" />
          <p className="text-lg text-secondary mb-2">No goals for today</p>
          <p className="text-sm text-tertiary">
            {hasOtherGoals
              ? 'Add a new goal or view all goals below'
              : 'Add your first goal to get started!'}
          </p>
        </div>
      )}

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
      {totalCount > 0 && (
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

              {/* Transfer Button - only show for incomplete goals after transfer time */}
              {showTransferButton && !goal.completed && (
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
      )}

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

      {/* View All Goals Button - Always visible */}
      <div className={cn('pt-4', totalCount > 0 && 'border-t border-border')}>
        <button
          type="button"
          onClick={toggleShowAllGoals}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-surface-variant hover:bg-primary-100 text-secondary hover:text-primary-600 transition-all font-medium"
        >
          <History className="w-4 h-4" />
          <span>{showAllGoals ? 'Hide History' : 'View All Goals'}</span>
          {showAllGoals ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {!showAllGoals && hasOtherGoals && (
            <span className="ml-1 text-xs bg-primary-600 text-white px-2 py-0.5 rounded-full">
              {goals.length - todayGoals.length}
            </span>
          )}
        </button>

        {/* Expanded Section: Filters + All Goals */}
        {showAllGoals && (
          <div className="mt-6 space-y-4">
            {/* Completion Filter */}
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-secondary font-medium">Show:</span>
              <div className="flex gap-1 bg-surface-variant rounded-lg p-1">
                {(['all', 'incomplete', 'completed'] as CompletionFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setCompletionFilter(filter)}
                    className={cn(
                      'px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize',
                      completionFilter === filter
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'text-secondary hover:text-primary hover:bg-surface'
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* All Goals List */}
            <AllGoalsList />
          </div>
        )}
      </div>
    </div>
  );
};
