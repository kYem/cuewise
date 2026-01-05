import type { Reminder } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Bell, CheckCircle2, Circle, Clock, Pencil, Repeat, Trash2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { formatCountdown, formatDueDate } from '../utils/reminder-date-utils';

interface ReminderItemProps {
  reminder: Reminder;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onSnooze?: (id: string, minutes: number) => void;
}

/**
 * Get container styling classes based on reminder state
 */
function getContainerClasses(completed: boolean, isOverdue: boolean, isSoon: boolean): string {
  if (completed) {
    return 'bg-surface-variant border-border';
  }
  if (isOverdue) {
    return 'bg-red-500/10 border-red-500/30 hover:border-red-500/50';
  }
  if (isSoon) {
    return 'bg-orange-500/10 border-orange-500/30 hover:border-orange-500/50';
  }
  return 'bg-surface border-border hover:border-primary-300';
}

export const ReminderItem: React.FC<ReminderItemProps> = ({
  reminder,
  onToggle,
  onDelete,
  onEdit,
  onSnooze,
}) => {
  const [countdown, setCountdown] = useState('');
  const { text, isOverdue, isSoon } = formatDueDate(reminder.dueDate);

  // Update countdown every second for reminders that are approaching
  useEffect(() => {
    if (!reminder.completed && isSoon) {
      // Set initial countdown value immediately
      setCountdown(formatCountdown(reminder.dueDate));

      const timer = setInterval(() => {
        setCountdown(formatCountdown(reminder.dueDate));
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [reminder.dueDate, reminder.completed, isSoon]);

  const handleSnooze = (minutes: number) => {
    if (onSnooze) {
      onSnooze(reminder.id, minutes);
    }
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-3 p-3 rounded-lg border-2 transition-all',
        getContainerClasses(reminder.completed, isOverdue, isSoon)
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={() => onToggle(reminder.id)}
        className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-full"
        aria-label={
          reminder.completed
            ? 'Mark as incomplete'
            : reminder.recurring?.enabled
              ? 'Mark done and advance to next occurrence'
              : 'Mark as complete'
        }
        title={
          reminder.recurring?.enabled && !reminder.completed
            ? 'Mark done and advance to next occurrence'
            : undefined
        }
      >
        {reminder.completed ? (
          <CheckCircle2 className="w-6 h-6 text-primary-600" />
        ) : (
          <Circle
            className={cn(
              'w-6 h-6 transition-colors',
              isOverdue
                ? 'text-red-400 group-hover:text-red-500'
                : 'text-tertiary group-hover:text-primary-500'
            )}
          />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Reminder Text */}
        <span
          className={cn(
            'block text-base transition-all',
            reminder.completed ? 'text-tertiary line-through' : 'text-primary'
          )}
        >
          {reminder.text}
        </span>

        {/* Due Date */}
        <div className="flex items-center gap-2 mt-1">
          <Clock
            className={cn(
              'w-3.5 h-3.5',
              reminder.completed
                ? 'text-tertiary'
                : isOverdue
                  ? 'text-red-500'
                  : isSoon
                    ? 'text-orange-500'
                    : 'text-secondary'
            )}
          />
          <span
            className={cn(
              'text-sm',
              reminder.completed
                ? 'text-tertiary'
                : isOverdue
                  ? 'text-red-600 font-medium'
                  : isSoon
                    ? 'text-orange-600 font-semibold'
                    : 'text-secondary'
            )}
          >
            {isSoon && !reminder.completed ? countdown : text}
          </span>

          {/* Recurring Indicator */}
          {reminder.recurring?.enabled && (
            <div className="flex items-center gap-1 ml-2">
              <Repeat className="w-3.5 h-3.5 text-primary-500" />
              <span className="text-xs text-primary-600 capitalize">
                {reminder.recurring.frequency}
              </span>
            </div>
          )}

          {/* Approaching Indicator */}
          {isSoon && !reminder.completed && (
            <Bell className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
          )}
        </div>

        {/* Snooze Buttons (show when approaching) */}
        {isSoon && !reminder.completed && onSnooze && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-xs text-secondary mr-1">Snooze:</span>
            <button
              type="button"
              onClick={() => handleSnooze(5)}
              className="px-2 py-1 text-xs font-medium text-orange-600 bg-orange-500/20 rounded hover:bg-orange-500/30 transition-colors"
            >
              5m
            </button>
            <button
              type="button"
              onClick={() => handleSnooze(15)}
              className="px-2 py-1 text-xs font-medium text-orange-600 bg-orange-500/20 rounded hover:bg-orange-500/30 transition-colors"
            >
              15m
            </button>
            <button
              type="button"
              onClick={() => handleSnooze(30)}
              className="px-2 py-1 text-xs font-medium text-orange-600 bg-orange-500/20 rounded hover:bg-orange-500/30 transition-colors"
            >
              30m
            </button>
          </div>
        )}
      </div>

      {/* Edit Button */}
      <button
        type="button"
        onClick={() => onEdit(reminder.id)}
        className="flex-shrink-0 p-2 text-secondary hover:text-primary-500 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
        aria-label="Edit reminder"
      >
        <Pencil className="w-4 h-4" />
      </button>

      {/* Delete Button */}
      <button
        type="button"
        onClick={() => onDelete(reminder.id)}
        className="flex-shrink-0 p-2 text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded"
        aria-label="Delete reminder"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};
