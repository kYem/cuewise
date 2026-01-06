import { cn } from '@cuewise/ui';
import { CheckCircle2, Circle } from 'lucide-react';
import type React from 'react';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { GoalInput } from './GoalInput';

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

  const focusedGoalId = settings.focusedGoalId;

  // Find the focused goal, or default to first incomplete goal
  const focusedGoal = todayTasks.find((g) => g.id === focusedGoalId);
  const incompleteGoals = todayTasks.filter((g) => !g.completed);

  // If focused goal doesn't exist or is completed, suggest first incomplete
  const displayGoal = focusedGoal || incompleteGoals[0] || null;

  // Find the parent objective if this task is linked to one
  const parentObjective = displayGoal?.parentId
    ? goals.find((g) => g.id === displayGoal.parentId)
    : null;

  const handleToggle = async () => {
    if (displayGoal) {
      await toggleTask(displayGoal.id);
      // If completing the goal, clear the focused goal so it moves to next
      if (!displayGoal.completed) {
        // Find next incomplete goal after this one
        const nextIncomplete = incompleteGoals.find((g) => g.id !== displayGoal.id);
        if (nextIncomplete) {
          updateSettings({ focusedGoalId: nextIncomplete.id });
        } else {
          updateSettings({ focusedGoalId: null });
        }
      }
    }
  };

  // Empty state - show input directly
  if (todayTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="w-full max-w-xl">
          <GoalInput />
        </div>
      </div>
    );
  }

  // All tasks completed
  if (incompleteGoals.length === 0 && !focusedGoal) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <CheckCircle2 className="w-12 h-12 mb-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
        <p className="text-lg text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
          All done!
        </p>
        <p className="text-sm text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
          Completed {todayTasks.length} task{todayTasks.length !== 1 ? 's' : ''} today
        </p>
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
            {displayGoal.completed ? (
              <CheckCircle2 className="w-10 h-10 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
            ) : (
              <Circle className="w-10 h-10 text-white/80 group-hover:text-white transition-colors drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
            )}
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
          <GoalInput onTaskAdded={onCloseAddInput} />
        </div>
      )}
    </div>
  );
};
