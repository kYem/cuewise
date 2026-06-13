import { type Goal, getDueDateLabel, getSubtaskProgress } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { CalendarClock, CheckCircle2, ListChecks, Plus } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { prefersReducedMotion } from '../utils/prefers-reduced-motion';
import { AnimatedCheckbox } from './AnimatedCheckbox';
import { GoalInput } from './GoalInput';

// How long to keep a just-completed task on screen so its tick can play before
// advancing — matches the AnimatedCheckbox spin→draw duration.
const TICK_HOLD_MS = 720;

interface GoalFocusViewProps {
  showAddInput?: boolean;
  onCloseAddInput?: () => void;
}

/**
 * Minimal focus view showing a single user-selected goal.
 * Designed to work without container wrapper, perfect for glass theme.
 */
export const GoalFocusView: React.FC<GoalFocusViewProps> = ({ showAddInput, onCloseAddInput }) => {
  const { todayTasks, toggleTask, goals } = useGoalStore();
  const { settings, updateSettings } = useSettingsStore();
  const [showAddInDone, setShowAddInDone] = useState(false);
  // A just-completed task we keep on screen so its tick animation can finish
  // playing before the view advances to the next task / "All done".
  const [animatingGoal, setAnimatingGoal] = useState<Goal | null>(null);

  const focusedGoalId = settings.focusedGoalId;

  // Find the focused goal, or default to first incomplete goal
  const focusedGoal = todayTasks.find((g) => g.id === focusedGoalId);
  const incompleteGoals = todayTasks.filter((g) => !g.completed);

  // Use the focused goal only while it's still incomplete; once it's done (e.g.
  // completed from another view) fall through to the next open task. The held
  // (animating) goal wins so its completion tick can finish playing.
  const activeFocusedGoal = focusedGoal && !focusedGoal.completed ? focusedGoal : null;
  const displayGoal = animatingGoal ?? activeFocusedGoal ?? incompleteGoals[0] ?? null;

  // Find the parent objective if this task is linked to one
  const parentObjective = displayGoal?.parentId
    ? goals.find((g) => g.id === displayGoal.parentId)
    : null;

  // Read-only metadata for the focused task (focus mode stays distraction-free)
  const subtaskProgress = displayGoal
    ? getSubtaskProgress(displayGoal)
    : { completed: 0, total: 0 };
  const hasSubtasks = subtaskProgress.total > 0;

  const handleToggle = async () => {
    // Ignore re-entry while a completion tick is still playing.
    if (animatingGoal || !displayGoal) {
      return;
    }

    const justCompleted = !displayGoal.completed;
    const completedId = displayGoal.id;
    const reducedMotion = prefersReducedMotion();

    // Hold the completed task on screen so its tick can play before advancing.
    // Set before the async toggle so the row doesn't flicker to the next task in
    // between. Skipped under reduced motion (there's no animation to wait for).
    if (justCompleted && !reducedMotion) {
      setAnimatingGoal({ ...displayGoal, completed: true });
    }

    await toggleTask(completedId);

    // Only completing a task advances the focus; un-completing stays put.
    if (!justCompleted) {
      return;
    }

    const nextIncomplete = incompleteGoals.find((g) => g.id !== completedId);
    const advance = () => {
      setAnimatingGoal(null);
      updateSettings({ focusedGoalId: nextIncomplete ? nextIncomplete.id : null });
    };

    if (reducedMotion) {
      advance();
      return;
    }
    window.setTimeout(advance, TICK_HOLD_MS);
  };

  // Empty state - show input directly
  if (todayTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="w-full max-w-xl">
          <GoalInput variant="minimal" />
        </div>
      </div>
    );
  }

  // All tasks completed (regardless of whether a now-completed task is still
  // focused). While the final task's tick is still playing, keep showing it.
  if (!animatingGoal && incompleteGoals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <CheckCircle2 className="w-12 h-12 mb-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
        <p className="text-lg text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
          All done!
        </p>
        <p className="text-sm text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
          Completed {todayTasks.length} task{todayTasks.length !== 1 ? 's' : ''} today
        </p>

        {/* Add another task */}
        {showAddInDone ? (
          <div className="w-full max-w-xl mt-6">
            <GoalInput variant="minimal" autoFocus onTaskAdded={() => setShowAddInDone(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddInDone(true)}
            className={cn(
              'mt-6 flex items-center gap-2 px-4 py-2 rounded-full',
              'bg-white/20 backdrop-blur-sm text-white',
              'hover:bg-white/30 transition-all',
              'drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]'
            )}
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">Add another</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* Focused Goal - minimal text-only display */}
      {displayGoal && (
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'group flex items-center gap-4 px-4 py-3 rounded-xl transition-all',
            'focus:outline-none focus:ring-2 focus:ring-white/30'
          )}
        >
          {/* Checkbox - hidden by default, shows on hover */}
          <div
            className={cn(
              'flex-shrink-0 transition-all duration-200',
              displayGoal.completed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <AnimatedCheckbox checked={displayGoal.completed} size="xl" tone="onImage" />
          </div>

          {/* Goal Text and Parent - stacked vertically */}
          <div className="flex flex-col items-start gap-1">
            <span
              className={cn(
                'text-3xl md:text-4xl text-left transition-all font-semibold',
                displayGoal.completed
                  ? 'text-white/60 line-through drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]'
                  : 'text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]'
              )}
              style={{
                textShadow: displayGoal.completed
                  ? '0 2px 4px rgba(0,0,0,0.5)'
                  : '0 2px 8px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4)',
              }}
            >
              {displayGoal.text}
            </span>

            {/* Read-only due-date + subtask progress for the focused task */}
            {(displayGoal.dueDate || hasSubtasks) && (
              <div
                className="flex items-center gap-3 text-sm text-white/70"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
              >
                {displayGoal.dueDate && (
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-3.5 h-3.5" />
                    {getDueDateLabel(displayGoal.dueDate)}
                  </span>
                )}
                {hasSubtasks && (
                  <span className="flex items-center gap-1">
                    <ListChecks className="w-3.5 h-3.5" />
                    {subtaskProgress.completed}/{subtaskProgress.total}
                  </span>
                )}
              </div>
            )}

            {/* Parent objective - shows on hover */}
            {parentObjective && (
              <span
                className="text-sm text-white/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
              >
                ↳ {parentObjective.text}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Add Goal Input (when shown) */}
      {showAddInput && (
        <div className="w-full max-w-xl mt-6">
          <GoalInput variant="minimal" onTaskAdded={onCloseAddInput} />
        </div>
      )}
    </div>
  );
};
