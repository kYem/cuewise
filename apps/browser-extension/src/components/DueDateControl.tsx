import { getTodayDateString } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { CalendarClock, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface DueDateControlProps {
  dueDate?: string;
  onSelect: (dueDate: string | null) => void;
}

/**
 * Compact due-date picker for a task: a calendar trigger that reveals a native
 * date input plus a clear action. Used inside the task row's edit-mode cluster.
 */
export const DueDateControl: React.FC<DueDateControlProps> = ({ dueDate, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const today = getTodayDateString();

  const handlePick = (value: string) => {
    onSelect(value || null);
    setIsOpen(false);
  };

  const handleClear = () => {
    onSelect(null);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsOpen((open) => !open);
        }}
        className={cn(
          'p-1 transition-colors focus:outline-none rounded',
          dueDate
            ? 'text-primary-600 hover:text-primary-700'
            : 'text-secondary hover:text-primary-600'
        )}
        aria-label={dueDate ? 'Change due date' : 'Set due date'}
        title={dueDate ? 'Change due date' : 'Set due date'}
      >
        <CalendarClock className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-10 mt-1 p-2 rounded-lg border border-border bg-surface/95 backdrop-blur-xl shadow-lg">
          <input
            type="date"
            aria-label="Due date"
            value={dueDate ?? ''}
            min={today}
            onChange={(e) => handlePick(e.target.value)}
            className="px-2 py-1 rounded border-2 border-border focus:border-primary-500 focus:outline-none text-sm text-primary"
          />
          {dueDate && (
            <button
              type="button"
              onClick={handleClear}
              className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Clear due date</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
