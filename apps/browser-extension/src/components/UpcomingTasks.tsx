import { getDueDateLabel, getTodayDateString, getUpcomingTasks } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { CalendarClock, ChevronDown, ChevronUp, Circle, MoveRight } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';

interface UpcomingTasksProps {
  defaultExpanded?: boolean;
  /** When false, render the rows directly without the collapsible trigger
   * (the home widget reveals Upcoming from the ⚙ menu instead). */
  showTrigger?: boolean;
}

/**
 * Collapsible list of tasks due within the upcoming window (getUpcomingTasks).
 * Store-connected so it can mount unchanged on the home list and the goals page.
 */
export const UpcomingTasks: React.FC<UpcomingTasksProps> = ({
  defaultExpanded = false,
  showTrigger = true,
}) => {
  const { goals, toggleTask, moveTaskToToday } = useGoalStore();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const today = getTodayDateString();

  const upcoming = useMemo(
    () =>
      getUpcomingTasks(goals)
        .filter((task) => !task.completed)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [goals]
  );

  if (upcoming.length === 0) {
    return null;
  }

  const rowsVisible = showTrigger ? expanded : true;

  return (
    <div className="pt-2.5 border-t border-border space-y-1.5">
      {showTrigger ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-secondary hover:text-primary-600 transition-colors"
          aria-label={expanded ? 'Hide upcoming tasks' : 'Show upcoming tasks'}
        >
          <CalendarClock className="w-3.5 h-3.5" />
          <span>Upcoming</span>
          <span className="ml-0.5 text-[10px] bg-primary-600 text-white px-1.5 py-0.5 rounded-full">
            {upcoming.length}
          </span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      ) : (
        <div className="px-0.5 text-xs font-medium text-tertiary">Upcoming</div>
      )}

      {rowsVisible && (
        <div className={cn('space-y-1.5', showTrigger && 'mt-1')}>
          {upcoming.map((task) => (
            <div
              key={task.id}
              className="group flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-surface-variant/30 hover:border-primary-300 transition-all"
            >
              <button
                type="button"
                onClick={() => toggleTask(task.id)}
                className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-full"
                aria-label="Mark as complete"
              >
                <Circle className="w-5 h-5 text-tertiary group-hover:text-primary-500 transition-colors" />
              </button>
              <span className="flex-1 min-w-0 text-sm text-primary truncate">{task.text}</span>
              <span className="flex items-center gap-1 flex-shrink-0 text-xs text-secondary bg-surface-variant px-1.5 py-0.5 rounded-full">
                <CalendarClock className="w-3 h-3" />
                {getDueDateLabel(task.dueDate)}
              </span>
              {task.date !== today && (
                <button
                  type="button"
                  onClick={() => moveTaskToToday(task.id)}
                  className="flex-shrink-0 p-1 text-secondary hover:text-primary-600 hover:bg-primary-50 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Move to today"
                  title="Move to today"
                >
                  <MoveRight className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
