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
  const { todayTasks, toggleTask } = useGoalStore();
  const { settings, updateSettings } = useSettingsStore();

  const focusedGoalId = settings.focusedGoalId;

  // Find the focused goal, or default to first incomplete goal
  const focusedGoal = todayTasks.find((g) => g.id === focusedGoalId);
  const incompleteGoals = todayTasks.filter((g) => !g.completed);

  // If focused goal doesn't exist or is completed, suggest first incomplete
  const displayGoal = focusedGoal || incompleteGoals[0] || null;

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
        <div className="w-full max-w-md">
          <GoalInput />
        </div>
      </div>
    );
  }

  // All tasks completed
  if (incompleteGoals.length === 0 && !focusedGoal) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <CheckCircle2 className="w-12 h-12 mb-3 text-primary-600" />
        <p className="text-lg text-primary font-medium">All done!</p>
        <p className="text-sm text-secondary/80">
          Completed {todayTasks.length} task{todayTasks.length !== 1 ? 's' : ''} today
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* Focused Goal - single item display */}
      {displayGoal && (
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'group flex items-center gap-4 px-6 py-4 rounded-xl transition-all',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/50',
            displayGoal.completed
              ? 'bg-primary-500/20 backdrop-blur-sm'
              : 'bg-white/10 backdrop-blur-sm hover:bg-white/20 border border-white/10'
          )}
        >
          {/* Checkbox */}
          <div className="flex-shrink-0">
            {displayGoal.completed ? (
              <CheckCircle2 className="w-8 h-8 text-primary-600" />
            ) : (
              <Circle className="w-8 h-8 text-secondary/60 group-hover:text-primary-500 transition-colors" />
            )}
          </div>

          {/* Goal Text */}
          <span
            className={cn(
              'text-xl text-left transition-all',
              displayGoal.completed ? 'text-primary-600 line-through' : 'text-primary'
            )}
          >
            {displayGoal.text}
          </span>
        </button>
      )}

      {/* Add Goal Input (when shown) */}
      {showAddInput && (
        <div className="w-full max-w-md mt-6">
          <GoalInput onTaskAdded={onCloseAddInput} />
        </div>
      )}
    </div>
  );
};
