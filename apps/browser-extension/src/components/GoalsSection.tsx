import {
  type Goal,
  type GoalViewMode,
  getRecentIncompleteTasks,
  getUpcomingTasks,
} from '@cuewise/shared';
import { getStorageUsage, type StorageUsageInfo } from '@cuewise/storage';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import {
  AlignJustify,
  ArrowDown,
  ArrowUp,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  History,
  List,
  Settings2,
  Target,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCalendarStore } from '../stores/calendar-store';
import { useGoalStore } from '../stores/goal-store';
import { useSettingsStore } from '../stores/settings-store';
import { isCalendarFeatureEnabled } from '../utils/google-calendar';
import { CalendarStrip } from './CalendarStrip';
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

function getSubtitle(totalCount: number, incompleteCount: number): string {
  if (totalCount === 0) {
    return 'What matters most today?';
  }
  if (incompleteCount === 0) {
    return 'All done — well earned';
  }
  return `${incompleteCount} to go — keep your momentum`;
}

// Reveal toggle in the ⚙ menu (e.g. Show incomplete / Upcoming): icon + label +
// count badge, highlighted while active.
function MenuToggleItem({
  icon: Icon,
  label,
  count,
  active,
  onToggle,
}: {
  icon: typeof List;
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors',
        active ? 'bg-primary-50 text-primary-600' : 'text-primary hover:bg-surface-variant'
      )}
    >
      <Icon className="w-4 h-4" />
      <span className="flex-1 text-left">{label}</span>
      <span className="min-w-[18px] px-1 text-center text-[10px] font-bold rounded-full bg-primary-600 text-white">
        {count}
      </span>
    </button>
  );
}

export const GoalsSection: React.FC = () => {
  // State values - use useShallow to prevent re-renders when unrelated state changes
  const { isLoading, error, todayTasks, goals } = useGoalStore(
    useShallow((state) => ({
      isLoading: state.isLoading,
      error: state.error,
      todayTasks: state.todayTasks,
      goals: state.goals,
    }))
  );
  const initialize = useGoalStore((state) => state.initialize);

  // Settings - use useShallow for multiple values, individual selector for action
  const settings = useSettingsStore(useShallow((state) => state.settings));
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const initCalendar = useCalendarStore((state) => state.initialize);
  const [storageUsage, setStorageUsage] = useState<StorageUsageInfo | null>(null);
  const [showAddInput, setShowAddInput] = useState(false);

  const completedCount = todayTasks.filter((t) => t.completed).length;
  const totalCount = todayTasks.length;
  const incompleteCount = totalCount - completedCount;

  // Counts for the menu's "Show incomplete" (recent backlog) and "Upcoming" entries
  const recentIncompleteCount = getRecentIncompleteTasks(goals).length;
  const upcomingCount = getUpcomingTasks(goals).filter((t) => !t.completed).length;
  const focusedGoalId = settings.focusedGoalId;
  const focusedGoal = todayTasks.find((g) => g.id === focusedGoalId);
  const displayGoal = focusedGoal || todayTasks.find((g) => !g.completed) || null;

  const handleSelectGoal = (goalId: string) => {
    updateSettings({ focusedGoalId: goalId });
  };

  const viewMode = settings.goalViewMode;

  // Goals always show (with their density); the calendar is an optional add-on
  // stacked above/below, gated on the integration being provisioned.
  const calendarFeatureEnabled = isCalendarFeatureEnabled();
  const calendarPosition = settings.newTabCalendarPosition;
  const showCalendar = calendarFeatureEnabled && settings.newTabShowCalendar;

  useEffect(() => {
    initialize();
    loadStorageInfo();
  }, [initialize]);

  // Only touch calendar state when the calendar block is actually shown.
  useEffect(() => {
    if (showCalendar) {
      initCalendar();
    }
  }, [showCalendar, initCalendar]);

  const loadStorageInfo = async () => {
    const usage = await getStorageUsage();
    setStorageUsage(usage);
  };

  const handleModeChange = (mode: GoalViewMode) => {
    updateSettings({ goalViewMode: mode });
  };

  const handleToggleCalendar = () => {
    updateSettings({ newTabShowCalendar: !settings.newTabShowCalendar });
  };

  const handleToggleCalendarPosition = () => {
    updateSettings({ newTabCalendarPosition: calendarPosition === 'above' ? 'below' : 'above' });
  };

  const handleToggleShowCompleted = () => {
    updateSettings({ showCompletedGoals: !settings.showCompletedGoals });
  };

  const handleToggleShowIncomplete = () => {
    updateSettings({ showIncompleteGoals: !settings.showIncompleteGoals });
  };

  const handleToggleShowUpcoming = () => {
    updateSettings({ showUpcomingGoals: !settings.showUpcomingGoals });
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-[400px] mx-auto">
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
      <div className="w-full max-w-[400px] mx-auto">
        <div className="bg-surface/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-border">
          <ErrorFallback error={error} title="Failed to load goals" onRetry={initialize} />
        </div>
      </div>
    );
  }

  // Encouragement line under the title, mirroring the goals-widget design
  const subtitle = getSubtitle(totalCount, incompleteCount);

  // Consolidated view-options menu (⚙) — view mode + show-completed / incomplete
  // / upcoming toggles (or the focus-on picker in focus mode). Used in all modes.
  const optionsMenu = (triggerClassName?: string) => (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-lg bg-surface-variant/80 hover:bg-surface-variant backdrop-blur-sm text-secondary hover:text-primary transition-all border border-border',
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
          {VIEW_MODES.map(({ mode, icon: Icon, label }) => {
            const active = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => handleModeChange(mode)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors',
                  active
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-primary hover:bg-surface-variant'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                {active && <Check className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </div>

        {calendarFeatureEnabled && (
          <>
            <div className="border-t border-border my-2" />
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-primary">
              <Calendar className="w-4 h-4" />
              <span className="flex-1 text-left">Calendar</span>
              {settings.newTabShowCalendar && (
                <button
                  type="button"
                  onClick={handleToggleCalendarPosition}
                  aria-label={
                    calendarPosition === 'above' ? 'Calendar above goals' : 'Calendar below goals'
                  }
                  title={
                    calendarPosition === 'above'
                      ? 'Above goals — move below'
                      : 'Below goals — move above'
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface-variant hover:text-primary"
                >
                  {calendarPosition === 'above' ? (
                    <ArrowUp className="w-4 h-4" />
                  ) : (
                    <ArrowDown className="w-4 h-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleToggleCalendar}
                role="switch"
                aria-checked={settings.newTabShowCalendar}
                aria-label="Show calendar"
                className={cn(
                  'relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0',
                  settings.newTabShowCalendar ? 'bg-primary-600' : 'bg-divider'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform',
                    settings.newTabShowCalendar && 'translate-x-3.5'
                  )}
                />
              </button>
            </div>
          </>
        )}

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

            {recentIncompleteCount > 0 && (
              <MenuToggleItem
                icon={History}
                label="Show incomplete"
                count={recentIncompleteCount}
                active={settings.showIncompleteGoals}
                onToggle={handleToggleShowIncomplete}
              />
            )}

            {upcomingCount > 0 && (
              <MenuToggleItem
                icon={CalendarClock}
                label="Upcoming"
                count={upcomingCount}
                active={settings.showUpcomingGoals}
                onToggle={handleToggleShowUpcoming}
              />
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );

  const minHeight = viewMode === 'compact' ? '' : 'min-h-[120px]';

  // Goals block: focus renders centered without the card; full/compact use the card.
  const goalsContent =
    viewMode === 'focus' ? (
      <div className="group flex items-center justify-center gap-3 w-full max-w-4xl mx-auto">
        {/* Focus view - centered */}
        <GoalFocusView showAddInput={showAddInput} onCloseAddInput={() => setShowAddInput(false)} />

        {/* Options menu - inline, appears on hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {optionsMenu('bg-white/10 hover:bg-white/20 text-secondary/80 border-white/10')}
        </div>
      </div>
    ) : (
      <div className="w-full max-w-[400px] mx-auto">
        <div
          className={cn(
            'group bg-surface/80 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-border flex flex-col',
            minHeight
          )}
        >
          {/* Header */}
          {viewMode === 'full' ? (
            <div className="flex items-center gap-2.5 mb-4">
              {totalCount > 0 ? (
                <GoalProgressRing completed={completedCount} total={totalCount} size={40} />
              ) : (
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary-100 flex-shrink-0">
                  <Target className="w-5 h-5 text-primary-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-primary font-display">Today's Focus</h2>
                <p className="text-xs text-secondary">{subtitle}</p>
              </div>
              {optionsMenu()}
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-2.5">
              <Target className="w-4 h-4 text-primary-600 flex-shrink-0" />
              <h2 className="text-base font-semibold text-primary font-display flex-1">
                Today's Focus
              </h2>
              {totalCount > 0 && (
                <span className="text-xs text-secondary tabular-nums">
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

  // Goals always show; the calendar, when toggled on, stacks above or below.
  // Always render the same wrapper so toggling the calendar doesn't remount the
  // goals card (which would close the open options menu).
  return (
    <div className="flex flex-col items-center gap-density-lg w-full">
      {showCalendar && calendarPosition === 'above' && (
        <div className="w-full animate-fade-in motion-reduce:animate-none">
          <CalendarStrip variant="surface" />
        </div>
      )}
      {goalsContent}
      {showCalendar && calendarPosition === 'below' && (
        <div className="w-full animate-fade-in motion-reduce:animate-none">
          <CalendarStrip variant="surface" />
        </div>
      )}
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
