import { type Goal, getDueDateLabel, getSubtaskProgress } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { CalendarClock, ChevronRight } from 'lucide-react';
import type React from 'react';
import { AnimatedCheckbox } from './AnimatedCheckbox';

interface CompactGoalRowProps {
  goal: Goal;
  expanded: boolean;
  onToggleComplete: () => void;
  onToggleExpand: () => void;
  onToggleSubtask: (subtaskId: string) => void;
}

/**
 * Slim glanceable goal row for compact view: a completion ring, the goal text
 * with an inline subtask progress bar, and an accordion chevron. Completing and
 * toggling subtasks is allowed; renaming/deleting/reordering live in full view.
 */
export const CompactGoalRow: React.FC<CompactGoalRowProps> = ({
  goal,
  expanded,
  onToggleComplete,
  onToggleExpand,
  onToggleSubtask,
}) => {
  const subtasks = goal.subtasks ?? [];
  const hasSubtasks = subtasks.length > 0;
  const { completed, total } = getSubtaskProgress(goal);
  // A completed goal reads as a full bar regardless of subtask state.
  let ratio = 0;
  if (goal.completed) {
    ratio = 1;
  } else if (total > 0) {
    ratio = completed / total;
  }
  const progressPercentage = Math.min(1, Math.max(0, ratio)) * 100;

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden transition-colors',
        expanded ? 'bg-surface-variant/60' : 'bg-surface-variant/30 hover:bg-surface-variant/50'
      )}
    >
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        {/* Completion toggle */}
        <button
          type="button"
          onClick={onToggleComplete}
          aria-label={goal.completed ? 'Mark as incomplete' : 'Mark as complete'}
          className="flex flex-shrink-0 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <AnimatedCheckbox checked={goal.completed} size="md" />
        </button>

        {/* Text + inline progress bar */}
        <button
          type="button"
          onClick={() => {
            if (hasSubtasks) {
              onToggleExpand();
            }
          }}
          className={cn('min-w-0 flex-1 text-left', !hasSubtasks && 'cursor-default')}
        >
          <span
            className={cn(
              'block truncate text-sm',
              goal.completed ? 'text-tertiary line-through' : 'text-primary'
            )}
          >
            {goal.text}
          </span>
          {hasSubtasks && (
            <span className="mt-1 flex items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-divider">
                {/* Foreground-tinted fill via currentColor: light on glass, dark on light themes */}
                <span
                  className="block h-full rounded-full bg-current text-primary/80 transition-all duration-300 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                />
              </span>
              <span className="text-[10px] tabular-nums text-tertiary">
                {completed}/{total}
              </span>
            </span>
          )}
        </button>

        {/* Accordion chevron (only when there are subtasks) */}
        {hasSubtasks ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? 'Hide subtasks' : 'Show subtasks'}
            className="flex-shrink-0 text-tertiary hover:text-secondary transition-transform"
            style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" aria-hidden="true" />
        )}
      </div>

      {/* Expanded subtasks + due date */}
      {expanded && hasSubtasks && (
        <div className="space-y-1 px-2 pb-2 pl-10">
          {subtasks.map((subtask) => (
            <button
              key={subtask.id}
              type="button"
              onClick={() => onToggleSubtask(subtask.id)}
              className="flex w-full items-center gap-2 text-left"
              aria-label={
                subtask.completed
                  ? `Mark "${subtask.text}" incomplete`
                  : `Mark "${subtask.text}" complete`
              }
            >
              <AnimatedCheckbox checked={subtask.completed} size="sm" className="flex-shrink-0" />
              <span
                className={cn(
                  'text-xs',
                  subtask.completed ? 'text-tertiary line-through' : 'text-primary'
                )}
              >
                {subtask.text}
              </span>
            </button>
          ))}
          {goal.dueDate && (
            <span className="flex items-center gap-1 text-[10px] text-tertiary">
              <CalendarClock className="w-3 h-3" />
              {getDueDateLabel(goal.dueDate)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
