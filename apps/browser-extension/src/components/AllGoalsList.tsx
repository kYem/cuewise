import { getRelativeDateLabel, getTodayDateString, isObjective } from '@cuewise/shared';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import {
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Flag,
  Link2,
  MoveRight,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';

export const AllGoalsList: React.FC = () => {
  const {
    goals,
    getFilteredTasksByDate,
    toggleTask,
    updateTask,
    deleteTask,
    transferTaskToNextDay,
    moveTaskToToday,
    completionFilter,
    getActiveGoals,
    linkTaskToGoal,
  } = useGoalStore();
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [linkPickerOpenFor, setLinkPickerOpenFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const groupedGoals = getFilteredTasksByDate();
  const today = getTodayDateString();
  const activeGoals = getActiveGoals();

  // Focus input when editing starts
  useEffect(() => {
    if (editingGoalId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingGoalId]);

  const handleLinkToGoal = async (taskId: string, goalId: string | null) => {
    await linkTaskToGoal(taskId, goalId);
    setLinkPickerOpenFor(null);
    setEditingGoalId(null);
  };

  const getLinkedGoal = (parentId: string | undefined) => {
    if (!parentId) {
      return null;
    }
    return goals.find((g) => g.id === parentId && isObjective(g));
  };

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
        const success = await updateTask(editingGoalId, editText.trim());
        if (!success) {
          // Keep edit mode open so user can retry
          return;
        }
      }
    }
    setEditingGoalId(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingGoalId(null);
    setEditText('');
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Don't save if clicking on an action button (move, transfer, link, delete)
    if (actionsRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    saveEdit();
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
                    onClick={() => toggleTask(goal.id)}
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
                      onBlur={handleBlur}
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

                  {/* Right side: badges and actions */}
                  <div
                    ref={editingGoalId === goal.id ? actionsRef : undefined}
                    className="flex items-center gap-1 flex-shrink-0"
                  >
                    {/* Goal link badge - hide in edit mode */}
                    {editingGoalId !== goal.id &&
                      (() => {
                        const linkedGoal = getLinkedGoal(goal.parentId);
                        if (!linkedGoal) {
                          return null;
                        }
                        return (
                          <span
                            className="flex items-center gap-1 text-xs text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full"
                            title={`Linked to: ${linkedGoal.text}`}
                          >
                            <Flag className="w-3 h-3" />
                            <span className="max-w-[80px] truncate">{linkedGoal.text}</span>
                          </span>
                        );
                      })()}

                    {/* Move to Today Button - only show in edit mode */}
                    {editingGoalId === goal.id && !isToday && !goal.completed && (
                      <button
                        type="button"
                        onMouseDown={async (e) => {
                          e.preventDefault();
                          const success = await moveTaskToToday(goal.id);
                          if (success) {
                            setEditingGoalId(null);
                          }
                        }}
                        className="p-1 text-secondary hover:text-primary-600 transition-colors focus:outline-none rounded"
                        aria-label="Move to today"
                        title="Move to today"
                      >
                        <MoveRight className="w-4 h-4" />
                      </button>
                    )}

                    {/* Transfer to Tomorrow Button - only show in edit mode */}
                    {editingGoalId === goal.id && isToday && !goal.completed && (
                      <button
                        type="button"
                        onMouseDown={async (e) => {
                          e.preventDefault();
                          const success = await transferTaskToNextDay(goal.id);
                          if (success) {
                            setEditingGoalId(null);
                          }
                        }}
                        className="p-1 text-secondary hover:text-primary-600 transition-colors focus:outline-none rounded"
                        aria-label="Transfer to tomorrow"
                        title="Move to tomorrow"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}

                    {/* Link to Goal Button - only show in edit mode */}
                    {editingGoalId === goal.id && activeGoals.length > 0 && (
                      <Popover
                        open={linkPickerOpenFor === goal.id}
                        onOpenChange={(open) => setLinkPickerOpenFor(open ? goal.id : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              'p-1 transition-colors focus:outline-none rounded',
                              goal.parentId
                                ? 'text-primary-600 hover:text-primary-700'
                                : 'text-secondary hover:text-primary-600'
                            )}
                            aria-label={goal.parentId ? 'Change linked goal' : 'Link to goal'}
                            title={goal.parentId ? 'Change linked goal' : 'Link to goal'}
                          >
                            <Link2 className="w-4 h-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="min-w-[180px] py-1 bg-surface/95 backdrop-blur-xl">
                          {goal.parentId && (
                            <button
                              type="button"
                              onClick={() => handleLinkToGoal(goal.id, null)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <span>Remove link</span>
                            </button>
                          )}
                          {activeGoals.map((obj) => {
                            const isLinked = goal.parentId === obj.id;
                            return (
                              <button
                                key={obj.id}
                                type="button"
                                onClick={() => handleLinkToGoal(goal.id, obj.id)}
                                className={cn(
                                  'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                                  isLinked
                                    ? 'bg-primary-50 text-primary-600'
                                    : 'text-primary hover:bg-surface-variant'
                                )}
                              >
                                <Flag className="w-3 h-3 flex-shrink-0" />
                                <span className="flex-1 truncate">{obj.text}</span>
                                {isLinked && (
                                  <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </PopoverContent>
                      </Popover>
                    )}

                    {/* Delete Button - only show in edit mode */}
                    {editingGoalId === goal.id && (
                      <button
                        type="button"
                        onMouseDown={async (e) => {
                          e.preventDefault();
                          await deleteTask(goal.id);
                        }}
                        className="p-1 text-secondary hover:text-red-500 transition-colors focus:outline-none rounded"
                        aria-label="Delete goal"
                        title="Delete goal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
