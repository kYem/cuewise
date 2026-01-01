import type { Reminder } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Bell, CheckCircle2, Circle, Clock, Pencil, Repeat, Trash2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { formatCountdown, formatDueDate } from '../utils/reminder-date-utils';

interface ReminderWidgetItemProps {
  reminder: Reminder;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onSnooze?: (id: string, minutes: number) => void;
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
}) => {
  const [countdown, setCountdown] = useState('');
  const { text, isOverdue, isSoon } = formatDueDate(reminder.dueDate);

  // Update countdown every second for reminders that are approaching
  useEffect(() => {
    if (!reminder.completed && isSoon) {
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
        'rounded-lg border-2 p-3 transition-all',
        reminder.completed
          ? 'bg-surface-variant border-border'
          : isOverdue
            ? 'bg-red-500/10 border-red-500/30'
            : isSoon
              ? 'bg-orange-500/10 border-orange-500/30'
              : 'bg-surface border-border'
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
                isOverdue ? 'text-red-400' : isSoon ? 'text-orange-400' : 'text-tertiary'
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
                  : isOverdue
                    ? 'text-red-500'
                    : isSoon
                      ? 'text-orange-500'
                      : 'text-secondary'
              )}
            />
            <span
              className={cn(
                'text-xs',
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
              <div className="flex items-center gap-0.5 ml-1">
                <Repeat className="w-3 h-3 text-primary-500" />
                <span className="text-xs text-primary-600 capitalize">
                  {reminder.recurring.frequency}
                </span>
              </div>
            )}

            {/* Approaching Indicator */}
            {isSoon && !reminder.completed && (
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

      {/* Snooze Buttons (show when approaching) */}
      {isSoon && !reminder.completed && onSnooze && (
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
