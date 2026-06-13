import {
  type Goal,
  type GoalViewMode,
  getDueDateLabel,
  getRecentIncompleteTasks,
  getSubtaskProgress,
  getTodayDateString,
  isObjective,
  isPastGoalTransferTime,
} from '@cuewise/shared';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  ExternalLink,
  Flag,
  Link2,
  MoveRight,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import emptyTasksAnimation from '../assets/lottie/empty/tasks.json';
import { useGoalEditing } from '../hooks/useGoalEditing';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { CompactGoalRow } from './CompactGoalRow';
import { DueDateControl } from './DueDateControl';
import { EmptyState } from './EmptyState';
import { GoalInput } from './GoalInput';
import { getFilteredReorder, SortableTaskItem } from './SortableTaskItem';
import { UpcomingTasks } from './UpcomingTasks';

interface GoalsListProps {
  viewMode?: GoalViewMode;
}

// Checkbox-style icon shared by the read-only and editable subtask rows.
function SubtaskCheckIcon({ completed }: { completed: boolean }): React.ReactElement {
  if (completed) {
    return <CheckCircle2 className="w-4 h-4 text-primary-600 flex-shrink-0" />;
  }
  return <Circle className="w-4 h-4 text-tertiary flex-shrink-0" />;
}

function subtaskTextClass(completed: boolean): string {
  return cn('text-sm', completed ? 'text-tertiary line-through' : 'text-primary');
}

function subtaskToggleLabel(text: string, completed: boolean): string {
  return completed ? `Mark "${text}" incomplete` : `Mark "${text}" complete`;
}

// Resting badge showing the objective a task is linked to (null if it resolves to none).
function LinkedGoalBadge({
  parentId,
  goals,
}: {
  parentId: string;
  goals: Goal[];
}): React.ReactElement | null {
  const linkedGoal = goals.find((g) => g.id === parentId && isObjective(g));
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
}

export const GoalsList: React.FC<GoalsListProps> = ({ viewMode = 'full' }) => {
  const {
    todayTasks,
    goals,
    toggleTask,
    updateTask,
    deleteTask,
    transferTaskToNextDay,
    moveTaskToToday,
    isLoading,
    getActiveGoals,
    linkTaskToGoal,
    duplicateTask,
    setTaskDueDate,
    addSubtask,
    toggleSubtask,
    removeSubtask,
    reorderTasks,
  } = useGoalStore();
  const { settings } = useSettingsStore();

  const activeGoals = getActiveGoals();
  const today = getTodayDateString();

  // When "show completed" is off, hide finished tasks from the list (header
  // counts still reflect the full set).
  const visibleTasks = settings.showCompletedGoals
    ? todayTasks
    : todayTasks.filter((task) => !task.completed);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Map drag positions within the visible list back to the full task order so
  // hiding completed tasks never corrupts ordering.
  const handleDragEnd = (event: DragEndEvent) => {
    const indices = getFilteredReorder(
      event,
      todayTasks.map((task) => task.id),
      visibleTasks.map((task) => task.id)
    );
    if (indices) {
      reorderTasks(indices.from, indices.to);
    }
  };

  const {
    editText,
    inputRef,
    actionsRef,
    startEditing,
    handleBlur,
    handleKeyDown,
    setEditText,
    handleLinkToGoal,
    isEditing,
    isLinkPickerOpen,
    openLinkPicker,
    closeLinkPicker,
    clearEditing,
  } = useGoalEditing({
    findGoalById: (id) => todayTasks.find((g) => g.id === id),
    updateTask,
    linkTaskToGoal,
  });

  const showTransferButton =
    settings.enableGoalTransfer && isPastGoalTransferTime(settings.goalTransferTime);

  // Which row's subtasks are expanded (one at a time) and the inline add field
  const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null);
  const [addingSubtaskId, setAddingSubtaskId] = useState<string | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  // Focus the inline subtask field when it opens (once, not on every keystroke)
  useEffect(() => {
    if (addingSubtaskId) {
      subtaskInputRef.current?.focus();
    }
  }, [addingSubtaskId]);

  const recentIncompleteGoals = useMemo(() => getRecentIncompleteTasks(goals), [goals]);

  const hasOtherGoals = goals.length > todayTasks.length;

  if (isLoading) {
    return <div className="text-center py-8 text-secondary">Loading goals...</div>;
  }

  return (
    <div className="space-y-2.5">
      {/* Empty State - Only show when no today's tasks */}
      {todayTasks.length === 0 && (
        <div className="text-center py-8">
          {viewMode === 'compact' ? (
            <GoalInput variant="widget" />
          ) : (
            <EmptyState
              animationData={emptyTasksAnimation}
              title="No tasks for today"
              description={
                hasOtherGoals
                  ? 'View incomplete tasks below'
                  : 'Add your first task to get started!'
              }
            />
          )}
        </div>
      )}

      {/* Goals List */}
      {visibleTasks.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={visibleTasks.map((task) => task.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1.5">
              {visibleTasks.map((goal) => (
                <SortableTaskItem
                  key={goal.id}
                  id={goal.id}
                  showHandle={viewMode === 'full' && isEditing(goal.id)}
                >
                  {viewMode === 'compact' ? (
                    <CompactGoalRow
                      goal={goal}
                      expanded={expandedSubtaskId === goal.id}
                      onToggleComplete={() => toggleTask(goal.id)}
                      onToggleExpand={() =>
                        setExpandedSubtaskId(expandedSubtaskId === goal.id ? null : goal.id)
                      }
                      onToggleSubtask={(subtaskId) => toggleSubtask(goal.id, subtaskId)}
                    />
                  ) : (
                    <div
                      className={cn(
                        'group px-3 py-2 rounded-xl border transition-all',
                        goal.completed
                          ? 'bg-surface-variant/40 border-border/60'
                          : 'bg-surface-variant/30 border-border hover:border-primary-300'
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleTask(goal.id)}
                          className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-full"
                          aria-label={goal.completed ? 'Mark as incomplete' : 'Mark as complete'}
                        >
                          {goal.completed ? (
                            <CheckCircle2 className="w-5 h-5 text-primary-600" />
                          ) : (
                            <Circle className="w-5 h-5 text-tertiary group-hover:text-primary-500 transition-colors" />
                          )}
                        </button>

                        {/* Goal Text */}
                        {isEditing(goal.id) ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onBlur={handleBlur}
                            onKeyDown={handleKeyDown}
                            maxLength={200}
                            className="flex-1 min-w-0 text-sm px-2 py-1 border-2 border-primary-500 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditing(goal.id, goal.text)}
                            className={cn(
                              'flex-1 text-sm text-left transition-all hover:bg-surface-variant px-2 py-1 rounded',
                              goal.completed ? 'text-tertiary line-through' : 'text-primary'
                            )}
                          >
                            {goal.text}
                          </button>
                        )}

                        {/* Right side: badges and actions */}
                        <div
                          ref={isEditing(goal.id) ? actionsRef : undefined}
                          className="flex items-center gap-1 flex-shrink-0"
                        >
                          {/* Goal link badge - hide in edit mode */}
                          {!isEditing(goal.id) && goal.parentId && (
                            <LinkedGoalBadge parentId={goal.parentId} goals={goals} />
                          )}

                          {/* Subtask count toggle (resting, full mode) — expands list below */}
                          {!isEditing(goal.id) &&
                            viewMode === 'full' &&
                            (goal.subtasks?.length ?? 0) > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSubtaskId(
                                    expandedSubtaskId === goal.id ? null : goal.id
                                  )
                                }
                                aria-label={
                                  expandedSubtaskId === goal.id ? 'Hide subtasks' : 'Show subtasks'
                                }
                                className="flex items-center gap-1 text-xs text-secondary hover:text-primary-600 transition-colors"
                              >
                                <span className="font-medium tabular-nums">
                                  {getSubtaskProgress(goal).completed}/
                                  {getSubtaskProgress(goal).total}
                                </span>
                                {expandedSubtaskId === goal.id ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                            )}

                          {/* Due date badge - hide in edit mode (control shown instead) */}
                          {!isEditing(goal.id) && goal.dueDate && (
                            <span
                              className={cn(
                                'flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full',
                                !goal.completed && goal.dueDate < today
                                  ? 'text-red-600 bg-red-50'
                                  : 'text-secondary bg-surface-variant'
                              )}
                              title={`Due ${goal.dueDate}`}
                            >
                              <CalendarClock className="w-3 h-3" />
                              <span>{getDueDateLabel(goal.dueDate)}</span>
                            </span>
                          )}

                          {isEditing(goal.id) && (
                            <DueDateControl
                              dueDate={goal.dueDate}
                              onSelect={(dueDate) => setTaskDueDate(goal.id, dueDate)}
                            />
                          )}

                          {/* Transfer Button - only show in edit mode */}
                          {isEditing(goal.id) && showTransferButton && !goal.completed && (
                            <button
                              type="button"
                              onMouseDown={async (e) => {
                                e.preventDefault();
                                const success = await transferTaskToNextDay(goal.id);
                                if (success) {
                                  clearEditing();
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
                          {isEditing(goal.id) && activeGoals.length > 0 && (
                            <Popover
                              open={isLinkPickerOpen(goal.id)}
                              onOpenChange={(open) =>
                                open ? openLinkPicker(goal.id) : closeLinkPicker()
                              }
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

                          {/* Duplicate Button - only show in edit mode */}
                          {isEditing(goal.id) && (
                            <button
                              type="button"
                              onMouseDown={async (e) => {
                                e.preventDefault();
                                const success = await duplicateTask(goal.id);
                                if (success) {
                                  clearEditing();
                                }
                              }}
                              className="p-1 text-secondary hover:text-primary-600 transition-colors focus:outline-none rounded"
                              aria-label="Duplicate task"
                              title="Duplicate task"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}

                          {/* Delete Button - only show in edit mode */}
                          {isEditing(goal.id) && (
                            <button
                              type="button"
                              onMouseDown={async (e) => {
                                e.preventDefault();
                                await deleteTask(goal.id);
                              }}
                              className="p-1 text-secondary hover:text-red-500 transition-colors focus:outline-none rounded"
                              aria-label="Delete goal"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Full mode: read-only subtasks revealed by the inline n/m toggle */}
                      {viewMode === 'full' &&
                        !isEditing(goal.id) &&
                        expandedSubtaskId === goal.id &&
                        (goal.subtasks?.length ?? 0) > 0 && (
                          <div className="mt-1.5 pl-9 space-y-1">
                            {(goal.subtasks ?? []).map((subtask) => (
                              <button
                                key={subtask.id}
                                type="button"
                                onClick={() => toggleSubtask(goal.id, subtask.id)}
                                className="flex w-full items-center gap-2 text-left"
                                aria-label={subtaskToggleLabel(subtask.text, subtask.completed)}
                              >
                                <SubtaskCheckIcon completed={subtask.completed} />
                                <span className={subtaskTextClass(subtask.completed)}>
                                  {subtask.text}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                      {/* Full mode edit: editable subtasks + add (kept mounted while adding
                        so the edit-input blur doesn't drop the add field) */}
                      {viewMode === 'full' &&
                        (isEditing(goal.id) || addingSubtaskId === goal.id) && (
                          <div className="mt-2 pl-9 space-y-1">
                            {(goal.subtasks ?? []).map((subtask) => (
                              <div key={subtask.id} className="group/sub flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleSubtask(goal.id, subtask.id)}
                                  className="flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  aria-label={subtaskToggleLabel(subtask.text, subtask.completed)}
                                >
                                  <SubtaskCheckIcon completed={subtask.completed} />
                                </button>
                                <span className={cn('flex-1', subtaskTextClass(subtask.completed))}>
                                  {subtask.text}
                                </span>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => removeSubtask(goal.id, subtask.id)}
                                  className="flex-shrink-0 rounded p-0.5 text-secondary hover:text-red-500 opacity-0 group-hover/sub:opacity-100 focus:opacity-100"
                                  aria-label={`Remove "${subtask.text}"`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}

                            {addingSubtaskId === goal.id ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const text = subtaskDraft.trim();
                                  if (text) {
                                    addSubtask(goal.id, text);
                                  }
                                  setSubtaskDraft('');
                                  setAddingSubtaskId(null);
                                }}
                                className="flex items-center gap-2"
                              >
                                <Plus className="w-4 h-4 text-tertiary flex-shrink-0" />
                                <input
                                  ref={subtaskInputRef}
                                  type="text"
                                  aria-label="Add a subtask"
                                  placeholder="Add a subtask"
                                  value={subtaskDraft}
                                  onChange={(e) => setSubtaskDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                      setSubtaskDraft('');
                                      setAddingSubtaskId(null);
                                    }
                                  }}
                                  onBlur={() => {
                                    const text = subtaskDraft.trim();
                                    if (text) {
                                      addSubtask(goal.id, text);
                                    }
                                    setSubtaskDraft('');
                                    setAddingSubtaskId(null);
                                  }}
                                  maxLength={200}
                                  className="min-w-0 flex-1 border-b border-border bg-transparent px-2 py-1 text-sm text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none"
                                />
                              </form>
                            ) : (
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setAddingSubtaskId(goal.id)}
                                aria-label="Add subtask"
                                className="flex items-center gap-1 text-xs text-tertiary hover:text-primary-600 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add subtask</span>
                              </button>
                            )}
                          </div>
                        )}
                    </div>
                  )}
                </SortableTaskItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add a goal — bottom add row (full mode only, mirrors the widget design) */}
      {viewMode === 'full' && (
        <div className="pt-1">
          <GoalInput variant="widget" />
        </div>
      )}

      {/* Recent incomplete backlog — revealed from the ⚙ menu (Show incomplete) */}
      {viewMode === 'full' && settings.showIncompleteGoals && recentIncompleteGoals.length > 0 && (
        <div className="pt-2.5 border-t border-border space-y-1.5">
          <div className="px-0.5 text-xs font-medium text-tertiary">From the last 2 weeks</div>
          {recentIncompleteGoals.map((goal) => (
            <div
              key={goal.id}
              className="group flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-surface-variant/30 hover:border-primary-300 transition-all"
            >
              <button
                type="button"
                onClick={async () => {
                  await toggleTask(goal.id);
                }}
                className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-full"
                aria-label="Mark as complete"
              >
                <Circle className="w-5 h-5 text-tertiary group-hover:text-primary-500 transition-colors" />
              </button>
              <div className="flex-1 min-w-0">
                <span className="block truncate text-sm text-primary">{goal.text}</span>
                <span className="text-xs text-tertiary">{goal.date}</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await moveTaskToToday(goal.id);
                }}
                className="flex-shrink-0 p-1 text-secondary hover:text-primary-600 hover:bg-primary-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                aria-label="Move to today"
                title="Move to today"
              >
                <MoveRight className="w-4 h-4" />
              </button>
            </div>
          ))}
          <a
            href="#goals"
            className="flex items-center justify-center gap-1.5 py-1 text-xs text-secondary hover:text-primary-600 transition-colors"
          >
            <span>View all goals</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Upcoming — revealed from the ⚙ menu */}
      {viewMode === 'full' && settings.showUpcomingGoals && <UpcomingTasks showTrigger={false} />}
    </div>
  );
};
