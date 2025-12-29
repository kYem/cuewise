import { getRelativeDateLabel, getTodayDateString, isObjective } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import {
  ArrowRight,
  Calendar,
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
  const [linkingGoalId, setLinkingGoalId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkPickerRef = useRef<HTMLDivElement>(null);

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

  // Close link picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (linkPickerRef.current && !linkPickerRef.current.contains(event.target as Node)) {
        setLinkingGoalId(null);
      }
    };

    if (linkingGoalId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [linkingGoalId]);

  const handleLinkToGoal = async (taskId: string, goalId: string | null) => {
    try {
      await linkTaskToGoal(taskId, goalId);
      setLinkingGoalId(null);
      setEditingGoalId(null);
    } catch {
      // Store handles error logging and toast notification
    }
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
        try {
          await updateTask(editingGoalId, editText.trim());
        } catch {
          // Store handles error logging and toast notification
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
                    onClick={async () => {
                      try {
                        await toggleTask(goal.id);
                      } catch {
                        // Store handles error logging and toast notification
                      }
                    }}
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

                  {/* Right side: badges and actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Objective link badge - hide in edit mode */}
                    {editingGoalId !== goal.id &&
                      (() => {
                        const objective = getLinkedGoal(goal.parentId);
                        if (!objective) {
                          return null;
                        }
                        return (
                          <span
                            className="flex items-center gap-1 text-xs text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full"
                            title={`Linked to: ${objective.text}`}
                          >
                            <Flag className="w-3 h-3" />
                            <span className="max-w-[80px] truncate">{objective.text}</span>
                          </span>
                        );
                      })()}

                    {/* Transfer count badge - hide in edit mode */}
                    {editingGoalId !== goal.id && goal.transferCount && goal.transferCount > 0 && (
                      <span
                        className="text-xs text-tertiary px-1"
                        title={`Transferred ${goal.transferCount} time${goal.transferCount > 1 ? 's' : ''}`}
                      >
                        ↻{goal.transferCount}
                      </span>
                    )}

                    {/* Move to Today Button - only show in edit mode */}
                    {editingGoalId === goal.id && !isToday && !goal.completed && (
                      <button
                        type="button"
                        onMouseDown={async (e) => {
                          e.preventDefault();
                          try {
                            await moveTaskToToday(goal.id);
                            setEditingGoalId(null);
                          } catch {
                            // Store handles error logging and toast notification
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
                          try {
                            await transferTaskToNextDay(goal.id);
                            setEditingGoalId(null);
                          } catch {
                            // Store handles error logging and toast notification
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
                      <div className="relative">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            setLinkingGoalId(linkingGoalId === goal.id ? null : goal.id)
                          }
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

                        {/* Link Picker Dropdown */}
                        {linkingGoalId === goal.id && (
                          <div
                            ref={linkPickerRef}
                            className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-surface rounded-lg shadow-lg border border-border overflow-hidden"
                          >
                            <div className="py-1">
                              {goal.parentId && (
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleLinkToGoal(goal.id, null)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <span>Remove link</span>
                                </button>
                              )}
                              {activeGoals.map((obj) => (
                                <button
                                  key={obj.id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleLinkToGoal(goal.id, obj.id)}
                                  className={cn(
                                    'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                                    goal.parentId === obj.id
                                      ? 'bg-primary-50 text-primary-600'
                                      : 'text-primary hover:bg-surface-variant'
                                  )}
                                >
                                  <Flag className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate">{obj.text}</span>
                                  {goal.parentId === obj.id && (
                                    <span className="ml-auto text-xs text-primary-500">✓</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delete Button - only show in edit mode */}
                    {editingGoalId === goal.id && (
                      <button
                        type="button"
                        onMouseDown={async (e) => {
                          e.preventDefault();
                          try {
                            await deleteTask(goal.id);
                          } catch {
                            // Store handles error logging and toast notification
                          }
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
