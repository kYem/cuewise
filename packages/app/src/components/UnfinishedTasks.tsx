import { type Goal, getRecentIncompleteTasks, getRelativeDateLabel } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { ChevronDown, ChevronUp, ExternalLink, History, MoveRight, Trash2 } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useGoalStore } from '../stores/goal-store';
import { AnimatedCheckbox } from './AnimatedCheckbox';

// Past this many rows the group opens collapsed to its count line.
const COLLAPSE_THRESHOLD = 5;

// Not memoised on goals: "previous days" shifts at midnight without a new goals reference.
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

// Compact matches CompactGoalRow: borderless, one line, the date as a muted suffix.
const ROW_CLASS = {
  full: 'group flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-surface-variant/30 hover:border-primary-300 transition-all',
  compact:
    'group flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-surface-variant/30 hover:bg-surface-variant/50 transition-colors',
};

function UnfinishedRow({ task, compact }: { task: Goal; compact: boolean }): React.ReactElement {
  const { toggleTask, moveTaskToToday, deleteTask } = useGoalStore();
  const dateLabel = getRelativeDateLabel(task.date);

  return (
    <div className={compact ? ROW_CLASS.compact : ROW_CLASS.full}>
      <button
        type="button"
        onClick={() => toggleTask(task.id)}
        className="flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-full"
        aria-label={`Mark "${task.text}" complete`}
      >
        <AnimatedCheckbox checked={task.completed} size="md" />
      </button>
      {compact ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm text-primary">{task.text}</span>
          <span className="flex-shrink-0 text-[10px] text-tertiary">{dateLabel}</span>
        </>
      ) : (
        <div className="flex-1 min-w-0">
          <span className="block truncate text-sm text-primary">{task.text}</span>
          <span className="text-xs text-tertiary">{dateLabel}</span>
        </div>
      )}
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
  );
}

/** The home widget's Unfinished group; UnfinishedBanner is the goals-page counterpart. */
export const UnfinishedTasks: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
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
            <UnfinishedRow key={task.id} task={task} compact={compact} />
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
