import { formatReminderCadence, type Reminder } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import {
  Bell,
  CheckCircle2,
  Circle,
  Clock,
  Pause,
  Pencil,
  Play,
  Repeat,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { formatCountdown, formatDueDate } from '../utils/reminder-date-utils';

interface ReminderWidgetItemProps {
  reminder: Reminder;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onSnooze?: (id: string, minutes: number) => void;
  onPauseToggle?: (id: string, paused: boolean) => void;
}

/**
 * Get container styling classes based on reminder state
 */
function getContainerClasses(completed: boolean, isOverdue: boolean, isSoon: boolean): string {
  if (completed) {
    return 'bg-surface-variant border-border';
  }
  if (isOverdue) {
    return 'bg-red-500/10 border-red-500/30';
  }
  if (isSoon) {
    return 'bg-orange-500/10 border-orange-500/30';
  }
  return 'bg-surface border-border';
}

/**
 * Compact reminder item for the floating widget
 */
export const ReminderWidgetItem: React.FC<ReminderWidgetItemProps> = ({
  reminder,
  onToggle,
  onDelete,
  onEdit,
  onSnooze,
  onPauseToggle,
}) => {
  const [countdown, setCountdown] = useState('');
  const { text, isOverdue, isSoon } = formatDueDate(reminder.dueDate);
  const isPaused = reminder.recurring?.enabled === false;
  // A paused reminder's dueDate is frozen, so suppress all "soon"/"overdue" affordances.
  const showSoon = isSoon && !isPaused;
  const showOverdue = isOverdue && !isPaused;

  // Update countdown every second for reminders that are approaching
  useEffect(() => {
    if (!reminder.completed && showSoon) {
      // Set initial countdown value immediately
      setCountdown(formatCountdown(reminder.dueDate));

      const timer = setInterval(() => {
        setCountdown(formatCountdown(reminder.dueDate));
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [reminder.dueDate, reminder.completed, showSoon]);

  const handleSnooze = (minutes: number) => {
    if (onSnooze) {
      onSnooze(reminder.id, minutes);
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border-2 p-3 transition-all',
        getContainerClasses(reminder.completed, showOverdue, showSoon)
      )}
    >
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() => onToggle(reminder.id)}
          className="flex-shrink-0 mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded-full"
          aria-label={reminder.completed ? 'Mark as incomplete' : 'Mark as complete'}
        >
          {reminder.completed ? (
            <CheckCircle2 className="w-5 h-5 text-primary-600" />
          ) : (
            <Circle
              className={cn(
                'w-5 h-5 transition-colors',
                showOverdue ? 'text-red-400' : showSoon ? 'text-orange-400' : 'text-tertiary'
              )}
            />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Reminder Text */}
          <span
            className={cn(
              'block text-sm leading-tight',
              reminder.completed ? 'text-tertiary line-through' : 'text-primary'
            )}
          >
            {reminder.text}
          </span>

          {/* Due Date */}
          <div className="flex items-center gap-1.5 mt-1">
            <Clock
              className={cn(
                'w-3 h-3',
                reminder.completed
                  ? 'text-tertiary'
                  : showOverdue
                    ? 'text-red-500'
                    : showSoon
                      ? 'text-orange-500'
                      : 'text-secondary'
              )}
            />
            <span
              className={cn(
                'text-xs',
                reminder.completed
                  ? 'text-tertiary'
                  : showOverdue
                    ? 'text-red-600 font-medium'
                    : showSoon
                      ? 'text-orange-600 font-semibold'
                      : 'text-secondary'
              )}
            >
              {showSoon && !reminder.completed ? countdown : text}
            </span>

            {/* Recurring Indicator */}
            {reminder.recurring && (
              <div className="flex items-center gap-0.5 ml-1">
                <Repeat
                  className={cn('w-3 h-3', isPaused ? 'text-tertiary' : 'text-primary-500')}
                />
                <span
                  className={cn(
                    'text-xs first-letter:uppercase',
                    isPaused ? 'text-tertiary' : 'text-primary-600'
                  )}
                >
                  {formatReminderCadence(reminder.recurring)}
                  {isPaused ? ' (paused)' : ''}
                </span>
                {onPauseToggle && (
                  <button
                    type="button"
                    onClick={() => onPauseToggle(reminder.id, !isPaused)}
                    className="ml-0.5 p-0.5 text-secondary hover:text-primary-500 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                    aria-label={isPaused ? 'Resume reminder' : 'Pause reminder'}
                    title={isPaused ? 'Resume' : 'Pause'}
                  >
                    {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  </button>
                )}
              </div>
            )}

            {/* Approaching Indicator */}
            {showSoon && !reminder.completed && (
              <Bell className="w-3 h-3 text-orange-500 animate-pulse" />
            )}
          </div>
        </div>

        {/* Actions - always visible in compact mode */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onEdit(reminder.id)}
            className="p-1.5 text-secondary hover:text-primary-500 hover:bg-surface-variant rounded transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Edit reminder"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(reminder.id)}
            className="p-1.5 text-secondary hover:text-red-500 hover:bg-red-500/10 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label="Delete reminder"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Snooze Buttons (show when approaching, but not on paused reminders) */}
      {isSoon && !reminder.completed && !isPaused && onSnooze && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
          <span className="text-xs text-secondary mr-1">Snooze:</span>
          <button
            type="button"
            onClick={() => handleSnooze(5)}
            className="px-2 py-0.5 text-xs font-medium text-orange-600 bg-orange-500/20 rounded hover:bg-orange-500/30 transition-colors"
          >
            5m
          </button>
          <button
            type="button"
            onClick={() => handleSnooze(15)}
            className="px-2 py-0.5 text-xs font-medium text-orange-600 bg-orange-500/20 rounded hover:bg-orange-500/30 transition-colors"
          >
            15m
          </button>
          <button
            type="button"
            onClick={() => handleSnooze(30)}
            className="px-2 py-0.5 text-xs font-medium text-orange-600 bg-orange-500/20 rounded hover:bg-orange-500/30 transition-colors"
          >
            30m
          </button>
        </div>
      )}
    </div>
  );
};
