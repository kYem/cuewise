import type { Goal, GoalViewMode } from '@cuewise/shared';
import { getStorageUsage, type StorageUsageInfo } from '@cuewise/storage';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import {
  AlignJustify,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  List,
  Settings2,
  Target,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { ErrorFallback } from './ErrorFallback';
import { GoalFocusView } from './GoalFocusView';
import { GoalProgressRing } from './GoalProgressRing';
import { GoalsList } from './GoalsList';
import { StorageIndicator } from './StorageIndicator';

const VIEW_MODES: { mode: GoalViewMode; icon: typeof List; label: string }[] = [
  { mode: 'full', icon: List, label: 'Full' },
  { mode: 'compact', icon: AlignJustify, label: 'Compact' },
  { mode: 'focus', icon: Target, label: 'Focus' },
];

export const GoalsSection: React.FC = () => {
  // State values - use useShallow to prevent re-renders when unrelated state changes
  const { isLoading, error, todayTasks } = useGoalStore(
    useShallow((state) => ({
      isLoading: state.isLoading,
      error: state.error,
      todayTasks: state.todayTasks,
    }))
  );
  const initialize = useGoalStore((state) => state.initialize);

  // Settings - use useShallow for multiple values, individual selector for action
  const settings = useSettingsStore(useShallow((state) => state.settings));
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [storageUsage, setStorageUsage] = useState<StorageUsageInfo | null>(null);
  const [showAddInput, setShowAddInput] = useState(false);

  const completedCount = todayTasks.filter((t) => t.completed).length;
  const totalCount = todayTasks.length;
  const incompleteCount = totalCount - completedCount;
  const focusedGoalId = settings.focusedGoalId;
  const focusedGoal = todayTasks.find((g) => g.id === focusedGoalId);
  const displayGoal = focusedGoal || todayTasks.find((g) => !g.completed) || null;

  const handleSelectGoal = (goalId: string) => {
    updateSettings({ focusedGoalId: goalId });
  };

  const viewMode = settings.goalViewMode;

  useEffect(() => {
    initialize();
    loadStorageInfo();
  }, [initialize]);

  const loadStorageInfo = async () => {
    const usage = await getStorageUsage();
    setStorageUsage(usage);
  };

  const handleModeChange = (mode: GoalViewMode) => {
    updateSettings({ goalViewMode: mode });
  };

  const handleToggleShowCompleted = () => {
    updateSettings({ showCompletedGoals: !settings.showCompletedGoals });
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-surface/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-border">
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-surface/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-border">
          <ErrorFallback error={error} title="Failed to load goals" onRetry={initialize} />
        </div>
      </div>
    );
  }

  // Encouragement line under the title, mirroring the goals-widget design
  const subtitle =
    totalCount === 0
      ? 'What matters most today?'
      : incompleteCount === 0
        ? 'All done — well earned'
        : `${incompleteCount} to go — keep your momentum`;

  // Consolidated view-options menu (⚙) — view mode + show-completed (or the
  // focus-on picker in focus mode). Reused across all three modes.
  const optionsMenu = (triggerClassName?: string) => (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'p-2 rounded-full bg-surface-variant/80 hover:bg-surface-variant backdrop-blur-sm text-secondary hover:text-primary transition-all border border-border',
            triggerClassName
          )}
          aria-label="View options"
          title="View options"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 bg-surface/95 backdrop-blur-xl" align="end">
        <div className="text-xs font-medium text-tertiary px-2 py-1">View Mode</div>
        <div className="space-y-0.5">
          {VIEW_MODES.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleModeChange(mode)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors',
                viewMode === mode
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-primary hover:bg-surface-variant'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {viewMode === mode && <Check className="w-4 h-4 ml-auto" />}
            </button>
          ))}
        </div>

        {viewMode === 'focus' ? (
          todayTasks.length > 1 && (
            <>
              <div className="border-t border-border my-2" />
              <div className="text-xs font-medium text-tertiary px-2 py-1">
                Focus on ({incompleteCount} remaining)
              </div>
              <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                {todayTasks.map((goal) => (
                  <GoalSelectorItem
                    key={goal.id}
                    goal={goal}
                    isSelected={goal.id === displayGoal?.id}
                    onSelect={() => handleSelectGoal(goal.id)}
                  />
                ))}
              </div>
            </>
          )
        ) : (
          <>
            <div className="border-t border-border my-2" />
            <button
              type="button"
              onClick={handleToggleShowCompleted}
              role="menuitemcheckbox"
              aria-checked={settings.showCompletedGoals}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-primary hover:bg-surface-variant"
            >
              <Eye className="w-4 h-4" />
              <span className="flex-1 text-left">Show completed</span>
              <span
                className={cn(
                  'relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0',
                  settings.showCompletedGoals ? 'bg-primary-600' : 'bg-divider'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform',
                    settings.showCompletedGoals && 'translate-x-3.5'
                  )}
                />
              </span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );

  // Focus mode renders without container wrapper
  if (viewMode === 'focus') {
    return (
      <div className="group flex items-center justify-center gap-3 w-full max-w-2xl mx-auto">
        {/* Focus view - centered */}
        <GoalFocusView showAddInput={showAddInput} onCloseAddInput={() => setShowAddInput(false)} />

        {/* Options menu - inline, appears on hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {optionsMenu('bg-white/10 hover:bg-white/20 text-secondary/80 border-white/10')}
        </div>
      </div>
    );
  }

  const minHeight = viewMode === 'compact' ? 'min-h-[120px]' : 'min-h-[200px]';

  // Full and Compact modes render with container
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={cn(
          'group bg-surface/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-border flex flex-col',
          minHeight
        )}
      >
        {/* Header */}
        {viewMode === 'full' ? (
          <div className="flex items-center gap-3 mb-5">
            {totalCount > 0 ? (
              <GoalProgressRing completed={completedCount} total={totalCount} />
            ) : (
              <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-primary-100 flex-shrink-0">
                <Target className="w-5 h-5 text-primary-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-primary font-display">Today's Focus</h2>
              <p className="text-sm text-secondary">{subtitle}</p>
            </div>
            {optionsMenu()}
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-primary-600 flex-shrink-0" />
            <h2 className="text-lg font-semibold text-primary font-display flex-1">
              Today's Focus
            </h2>
            {totalCount > 0 && (
              <span className="text-sm text-secondary tabular-nums">
                {completedCount}/{totalCount}
              </span>
            )}
            {optionsMenu()}
          </div>
        )}

        {/* Full Mode Content */}
        {viewMode === 'full' && (
          <>
            {/* Storage Warning - only show if warning or critical */}
            {storageUsage && (storageUsage.isWarning || storageUsage.isCritical) && (
              <div className="mb-4">
                <StorageIndicator mode="compact" />
              </div>
            )}

            {/* Goals List (tiles + bottom add input + history + upcoming) */}
            <div className="flex-1">
              <GoalsList viewMode="full" />
            </div>
          </>
        )}

        {/* Compact Mode Content */}
        {viewMode === 'compact' && (
          <div className="flex-1">
            <GoalsList viewMode="compact" />
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Individual goal item in the focus-on selector dropdown
 */
function GoalSelectorItem({
  goal,
  isSelected,
  onSelect,
}: {
  goal: Goal;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
        isSelected ? 'bg-primary-50 text-primary-600' : 'text-primary hover:bg-surface-variant',
        goal.completed && 'opacity-60'
      )}
    >
      {goal.completed ? (
        <CheckCircle2 className="w-4 h-4 text-primary-600 flex-shrink-0" />
      ) : (
        <Circle className="w-4 h-4 text-tertiary flex-shrink-0" />
      )}
      <span className={cn('flex-1 truncate', goal.completed && 'line-through')}>{goal.text}</span>
      {isSelected && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
    </button>
  );
}
