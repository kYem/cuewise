import { getTodayDateString, isObjective, isPastGoalTransferTime } from '@cuewise/shared';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ExternalLink,
  Flag,
  History,
  Link2,
  MoveRight,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';

export const GoalsList: React.FC = () => {
  const {
    todayTasks,
    goals,
    showAllTasks,
    toggleTask,
    updateTask,
    deleteTask,
    transferTaskToNextDay,
    moveTaskToToday,
    toggleShowAllTasks,
    isLoading,
    getActiveGoals,
    linkTaskToGoal,
  } = useGoalStore();
  const { settings } = useSettingsStore();
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [linkPickerOpenFor, setLinkPickerOpenFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const activeGoals = getActiveGoals();

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

  const handleLinkToGoal = async (taskId: string, goalId: string | null) => {
    await linkTaskToGoal(taskId, goalId);
    setLinkPickerOpenFor(null);
    setEditingGoalId(null);
  };

  const startEditing = (goalId: string, currentText: string) => {
    setEditingGoalId(goalId);
    setEditText(currentText);
  };

  const saveEdit = async () => {
    if (
      editingGoalId &&
      editText.trim() &&
      editText.trim() !== todayTasks.find((g) => g.id === editingGoalId)?.text
    ) {
      const success = await updateTask(editingGoalId, editText.trim());
      if (!success) {
        // Keep edit mode open so user can retry
        return;
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
    // Don't save if clicking on an action button (transfer, link, delete)
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

  if (isLoading) {
    return <div className="text-center py-8 text-secondary">Loading goals...</div>;
  }

  const completedCount = todayTasks.filter((g) => g.completed).length;
  const totalCount = todayTasks.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Get incomplete goals from the last 2 weeks (excluding today)
  const recentIncompleteGoals = useMemo(() => {
    const today = getTodayDateString();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];

    return goals.filter((goal) => {
      // Exclude today's goals (already shown above)
      if (goal.date === today) {
        return false;
      }
      // Only incomplete goals
      if (goal.completed) {
        return false;
      }
      // Only goals from the last 2 weeks
      if (goal.date < twoWeeksAgoStr) {
        return false;
      }
      return true;
    });
  }, [goals]);

  const recentIncompleteCount = recentIncompleteGoals.length;

  const hasOtherGoals = goals.length > todayTasks.length;

  return (
    <div className="space-y-4">
      {/* Empty State - Only show when no today's goals */}
      {todayTasks.length === 0 && (
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
          {todayTasks.map((goal) => (
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
                  goal.parentId &&
                  (() => {
                    const linkedGoal = goals.find((g) => g.id === goal.parentId && isObjective(g));
                    if (linkedGoal) {
                      return (
                        <span
                          className="flex items-center gap-1 text-xs text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full"
                          title={`Linked to: ${linkedGoal.text}`}
                        >
                          <Flag className="w-3 h-3" />
                          <span className="max-w-[80px] truncate">{linkedGoal.text}</span>
                        </span>
                      );
                    }
                    return null;
                  })()}

                {/* Transfer Button - only show in edit mode */}
                {editingGoalId === goal.id && showTransferButton && !goal.completed && (
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
                    title="Transfer to tomorrow"
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
                    <PopoverContent className="min-w-[180px] py-1">
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
                    onMouseDown={(e) => {
                      e.preventDefault();
                      deleteTask(goal.id);
                    }}
                    className="p-1 text-secondary hover:text-red-500 transition-colors focus:outline-none rounded"
                    aria-label="Delete goal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
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

      {/* Incomplete Goals Dropdown */}
      <div className={cn('pt-4', totalCount > 0 && 'border-t border-border')}>
        <button
          type="button"
          onClick={toggleShowAllTasks}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-surface-variant hover:bg-primary-100 text-secondary hover:text-primary-600 transition-all font-medium"
        >
          <History className="w-4 h-4" />
          <span>{showAllTasks ? 'Hide Incomplete' : 'Show Incomplete'}</span>
          {showAllTasks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {!showAllTasks && recentIncompleteCount > 0 && (
            <span className="ml-1 text-xs bg-primary-600 text-white px-2 py-0.5 rounded-full">
              {recentIncompleteCount}
            </span>
          )}
        </button>

        {/* Expanded Section: Incomplete Goals from Last 2 Weeks */}
        {showAllTasks && (
          <div className="mt-4 space-y-4">
            {recentIncompleteGoals.length === 0 ? (
              <p className="text-center text-sm text-tertiary py-4">
                No incomplete goals from the last 2 weeks
              </p>
            ) : (
              <div className="space-y-2">
                {recentIncompleteGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="group flex items-start gap-3 p-3 rounded-lg border-2 border-border bg-surface hover:border-primary-300 transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => toggleTask(goal.id)}
                      className="flex-shrink-0 mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-full"
                      aria-label="Mark as complete"
                    >
                      <Circle className="w-5 h-5 text-tertiary group-hover:text-primary-500 transition-colors" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-primary block">{goal.text}</span>
                      <span className="text-xs text-tertiary">{goal.date}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => moveTaskToToday(goal.id)}
                      className="flex-shrink-0 p-1.5 text-secondary hover:text-primary-600 hover:bg-primary-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Move to today"
                      title="Move to today"
                    >
                      <MoveRight className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Link to full Goals page */}
            <a
              href="#goals"
              className="flex items-center justify-center gap-2 py-2 text-sm text-secondary hover:text-primary-600 transition-colors"
            >
              <span>View all goals</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
