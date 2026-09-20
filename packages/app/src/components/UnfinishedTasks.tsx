import { type Goal, getRecentIncompleteTasks, getRelativeDateLabel } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { ChevronDown, ChevronUp, ExternalLink, History, MoveRight, Trash2 } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useGoalStore } from '../stores/goal-store';
import { AnimatedCheckbox } from './AnimatedCheckbox';

// Past this many rows the group opens collapsed to its count line.
const COLLAPSE_THRESHOLD = 5;

// Not memoised on goals: "previous days" moves at midnight while the goals array reference does not.
function useUnfinishedTasks(): { unfinished: Goal[]; moveAllToToday: () => Promise<boolean> } {
  const { goals, moveTasksToToday } = useGoalStore();
  const unfinished = getRecentIncompleteTasks(goals).sort((a, b) => b.date.localeCompare(a.date));
  const moveAllToToday = () => moveTasksToToday(unfinished.map((task) => task.id));
  return { unfinished, moveAllToToday };
}

function MoveAllButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 text-xs font-medium text-secondary hover:text-primary-600 transition-colors',
        className
      )}
    >
      <MoveRight className="w-3.5 h-3.5" />
      <span>Move all to today</span>
    </button>
  );
}

/**
 * One-line count + move-all for the goals page, which already lists every day below it
 * (with per-row move / complete / delete), so the rows are not repeated here.
 */
export const UnfinishedBanner: React.FC<{ className?: string }> = ({ className }) => {
  const { unfinished, moveAllToToday } = useUnfinishedTasks();

  if (unfinished.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-border bg-surface-variant/40 px-4 py-2.5',
        className
      )}
    >
      <History className="w-4 h-4 text-tertiary flex-shrink-0" />
      <span className="flex-1 text-sm text-secondary">
        {unfinished.length} unfinished from previous days
      </span>
      <MoveAllButton onClick={moveAllToToday} />
    </div>
  );
};

/** The home widget's Unfinished group; UnfinishedBanner is the goals-page counterpart. */
export const UnfinishedTasks: React.FC = () => {
  const { toggleTask, moveTaskToToday, deleteTask } = useGoalStore();
  const { unfinished, moveAllToToday } = useUnfinishedTasks();
  // null = never toggled, so the row count decides until the user picks.
  const [expandedByUser, setExpandedByUser] = useState<boolean | null>(null);

  if (unfinished.length === 0) {
    return null;
  }

  const expanded = expandedByUser ?? unfinished.length <= COLLAPSE_THRESHOLD;
  const headerLabel = `Unfinished (${unfinished.length})`;

  return (
    <div className="pt-2.5 border-t border-border space-y-1.5">
      <div className="flex items-center gap-2 px-0.5">
        <button
          type="button"
          onClick={() => setExpandedByUser(!expanded)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 text-xs font-medium text-tertiary hover:text-primary-600 transition-colors"
        >
          <History className="w-3.5 h-3.5" />
          <span>{headerLabel}</span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
        <MoveAllButton onClick={moveAllToToday} className="ml-auto" />
      </div>

      {expanded && (
        <>
          {unfinished.map((task) => (
            <div
              key={task.id}
              className="group flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-surface-variant/30 hover:border-primary-300 transition-all"
            >
              <button
                type="button"
                onClick={() => toggleTask(task.id)}
                className="flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-full"
                aria-label={`Mark "${task.text}" complete`}
              >
                <AnimatedCheckbox checked={task.completed} size="md" />
              </button>
              <div className="flex-1 min-w-0">
                <span className="block truncate text-sm text-primary">{task.text}</span>
                <span className="text-xs text-tertiary">{getRelativeDateLabel(task.date)}</span>
              </div>
              <button
                type="button"
                onClick={() => moveTaskToToday(task.id)}
                className="flex-shrink-0 p-1 text-secondary hover:text-primary-600 hover:bg-primary-50 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={`Move "${task.text}" to today`}
                title="Move to today"
              >
                <MoveRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => deleteTask(task.id)}
                className="flex-shrink-0 p-1 text-secondary hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={`Delete "${task.text}"`}
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
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
        </>
      )}
    </div>
  );
};
