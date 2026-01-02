import type { Goal, GoalViewMode } from '@cuewise/shared';
import { getStorageUsage, type StorageUsageInfo } from '@cuewise/storage';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { AlignJustify, Check, CheckCircle2, Circle, List, Settings2, Target } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { ErrorFallback } from './ErrorFallback';
import { GoalFocusView } from './GoalFocusView';
import { GoalInput } from './GoalInput';
import { GoalsList } from './GoalsList';
import { StorageIndicator } from './StorageIndicator';

export const GoalsSection: React.FC = () => {
  const { initialize, isLoading, error, todayTasks } = useGoalStore();
  const { settings, updateSettings } = useSettingsStore();
  const [storageUsage, setStorageUsage] = useState<StorageUsageInfo | null>(null);
  const [showAddInput, setShowAddInput] = useState(false);

  const incompleteCount = todayTasks.filter((t) => !t.completed).length;
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

  // Determine minimum height based on view mode
  const minHeight = viewMode === 'compact' ? 'min-h-[200px]' : 'min-h-[400px]';

  // Mode toggle component (reused in both layouts)
  const modeToggle = (
    <div className="flex items-center gap-1 bg-surface-variant/80 backdrop-blur-sm rounded-lg p-1">
      <ModeButton
        mode="full"
        currentMode={viewMode}
        icon={<List className="w-4 h-4" />}
        label="Full view"
        onClick={() => handleModeChange('full')}
      />
      <ModeButton
        mode="compact"
        currentMode={viewMode}
        icon={<AlignJustify className="w-4 h-4" />}
        label="Compact view"
        onClick={() => handleModeChange('compact')}
      />
      <ModeButton
        mode="focus"
        currentMode={viewMode}
        icon={<Target className="w-4 h-4" />}
        label="Focus view"
        onClick={() => handleModeChange('focus')}
      />
    </div>
  );

  // Combined settings popover for focus mode
  const focusModeSettings = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm text-secondary/80 hover:text-primary transition-all border border-white/10"
          title="Settings"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 bg-surface/95 backdrop-blur-xl" align="end">
        {/* View Mode Section */}
        <div className="mb-2">
          <div className="text-xs font-medium text-tertiary px-2 py-1">View Mode</div>
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => handleModeChange('full')}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors',
                viewMode === 'full'
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-primary hover:bg-surface-variant'
              )}
            >
              <List className="w-4 h-4" />
              <span>Full</span>
              {viewMode === 'full' && <Check className="w-4 h-4 ml-auto" />}
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('compact')}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors',
                viewMode === 'compact'
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-primary hover:bg-surface-variant'
              )}
            >
              <AlignJustify className="w-4 h-4" />
              <span>Compact</span>
              {viewMode === 'compact' && <Check className="w-4 h-4 ml-auto" />}
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('focus')}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors',
                viewMode === 'focus'
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-primary hover:bg-surface-variant'
              )}
            >
              <Target className="w-4 h-4" />
              <span>Focus</span>
              {viewMode === 'focus' && <Check className="w-4 h-4 ml-auto" />}
            </button>
          </div>
        </div>

        {/* Goal Selection Section - only show if multiple tasks */}
        {todayTasks.length > 1 && (
          <>
            <div className="border-t border-border my-2" />
            <div>
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
            </div>
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

        {/* Settings button - inline, appears on hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {focusModeSettings}
        </div>
      </div>
    );
  }

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
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {viewMode === 'full' && (
              <div className="p-2 bg-primary-100 rounded-lg">
                <Target className="w-6 h-6 text-primary-600" />
              </div>
            )}
            <div>
              <h2
                className={cn(
                  'font-semibold text-primary',
                  viewMode === 'full' ? 'text-2xl' : 'text-xl'
                )}
              >
                Today's Focus
              </h2>
              {viewMode === 'full' && (
                <p className="text-sm text-secondary">What matters most today?</p>
              )}
            </div>
          </div>

          {/* Mode Toggle - hidden by default in compact, visible on hover */}
          <div
            className={cn(
              'transition-opacity duration-200',
              viewMode === 'compact' && 'opacity-0 group-hover:opacity-100'
            )}
          >
            {modeToggle}
          </div>
        </div>

        {/* Full Mode Content */}
        {viewMode === 'full' && (
          <>
            {/* Goal Input */}
            <div className="mb-6">
              <GoalInput />
            </div>

            {/* Storage Warning - only show if warning or critical */}
            {storageUsage && (storageUsage.isWarning || storageUsage.isCritical) && (
              <div className="mb-4">
                <StorageIndicator mode="compact" />
              </div>
            )}

            {/* Goals List */}
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
 * Mode toggle button component
 */
function ModeButton({
  mode,
  currentMode,
  icon,
  label,
  onClick,
}: {
  mode: GoalViewMode;
  currentMode: GoalViewMode;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const isActive = mode === currentMode;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'p-2 rounded-md transition-all',
        isActive
          ? 'bg-surface text-primary-600 shadow-sm'
          : 'text-secondary hover:text-primary hover:bg-surface/50'
      )}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
    >
      {icon}
    </button>
  );
}

/**
 * Individual goal item in the selector dropdown
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
