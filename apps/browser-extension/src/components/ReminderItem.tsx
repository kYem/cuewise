import { type Reminder } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { CheckCircle2, Circle, Clock, Repeat, Trash2 } from 'lucide-react';
import { formatDistanceToNow, parseISO, isPast, isToday, isTomorrow } from 'date-fns';
import type React from 'react';

interface ReminderItemProps {
  reminder: Reminder;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Format the due date in a human-readable way
 */
function formatDueDate(dueDate: string): { text: string; isOverdue: boolean } {
  const date = parseISO(dueDate);
  const overdue = isPast(date) && !isToday(dueDate);

  if (isToday(dueDate)) {
    return { text: `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`, isOverdue: false };
  }

  if (isTomorrow(date)) {
    return { text: `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`, isOverdue: false };
  }

  if (overdue) {
    return {
      text: `${formatDistanceToNow(date, { addSuffix: true })}`,
      isOverdue: true,
    };
  }

  return {
    text: `in ${formatDistanceToNow(date)}`,
    isOverdue: false,
  };
}

export const ReminderItem: React.FC<ReminderItemProps> = ({ reminder, onToggle, onDelete }) => {
  const { text, isOverdue } = formatDueDate(reminder.dueDate);

  return (
    <div
      className={cn(
        'group flex items-center gap-3 p-3 rounded-lg border-2 transition-all',
        reminder.completed
          ? 'bg-gray-50 border-gray-200'
          : isOverdue
            ? 'bg-red-50 border-red-200 hover:border-red-300'
            : 'bg-white border-gray-200 hover:border-primary-300'
      )}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(reminder.id)}
        className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-full"
        aria-label={reminder.completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {reminder.completed ? (
          <CheckCircle2 className="w-6 h-6 text-primary-600" />
        ) : (
          <Circle
            className={cn(
              'w-6 h-6 transition-colors',
              isOverdue
                ? 'text-red-400 group-hover:text-red-500'
                : 'text-gray-400 group-hover:text-primary-500'
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
            reminder.completed ? 'text-gray-400 line-through' : 'text-gray-800'
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
                ? 'text-gray-400'
                : isOverdue
                  ? 'text-red-500'
                  : 'text-gray-500'
            )}
          />
          <span
            className={cn(
              'text-sm',
              reminder.completed
                ? 'text-gray-400'
                : isOverdue
                  ? 'text-red-600 font-medium'
                  : 'text-gray-600'
            )}
          >
            {text}
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
        </div>
      </div>

      {/* Delete Button */}
      <button
        onClick={() => onDelete(reminder.id)}
        className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded"
        aria-label="Delete reminder"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};
