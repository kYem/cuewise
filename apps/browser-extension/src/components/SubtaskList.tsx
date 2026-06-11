import { type Goal, getSubtaskProgress } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, ListChecks, Plus, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface SubtaskListProps {
  goal: Goal;
  onAdd: (text: string) => void;
  onToggle: (subtaskId: string) => void;
  onRemove: (subtaskId: string) => void;
  /** Compact rows show an inline mini progress bar; full rows show only n/m */
  compact?: boolean;
}

/**
 * Collapsible checklist of a task's subtasks: a progress toggle, per-subtask
 * complete/remove controls, and an inline add input.
 */
export const SubtaskList: React.FC<SubtaskListProps> = ({
  goal,
  onAdd,
  onToggle,
  onRemove,
  compact = false,
}) => {
  const subtasks = goal.subtasks ?? [];
  const { completed, total } = getSubtaskProgress(goal);
  const progressPercentage = total > 0 ? (completed / total) * 100 : 0;
  const [expanded, setExpanded] = useState(false);
  const [newText, setNewText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newText.trim();
    if (!text) {
      return;
    }
    onAdd(text);
    setNewText('');
  };

  return (
    <div
      className={cn(
        'pl-9',
        // No-subtask rows stay one-line until hover/focus so resting tiles are
        // compact, matching the widget design.
        total > 0 || expanded
          ? 'mt-1'
          : 'max-h-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:mt-1 group-hover:max-h-8 group-hover:opacity-100 focus-within:mt-1 focus-within:max-h-8 focus-within:opacity-100'
      )}
    >
      {total > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary-600 transition-colors"
          aria-label={expanded ? 'Hide subtasks' : 'Show subtasks'}
        >
          <ListChecks className="w-3.5 h-3.5" />
          {compact && (
            <span className="w-14 h-1.5 bg-divider rounded-full overflow-hidden" aria-hidden="true">
              <span
                className="block h-full bg-primary-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercentage}%` }}
              />
            </span>
          )}
          <span className="font-medium tabular-nums">
            {completed}/{total}
          </span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="flex items-center gap-1 text-xs text-tertiary hover:text-primary-600 transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>Add subtask</span>
        </button>
      )}

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {subtasks.map((subtask) => (
            <div key={subtask.id} className="group/sub flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggle(subtask.id)}
                className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-full"
                aria-label={
                  subtask.completed
                    ? `Mark "${subtask.text}" incomplete`
                    : `Mark "${subtask.text}" complete`
                }
              >
                {subtask.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-primary-600" />
                ) : (
                  <Circle className="w-4 h-4 text-tertiary hover:text-primary-500 transition-colors" />
                )}
              </button>
              <span
                className={cn(
                  'flex-1 text-sm',
                  subtask.completed ? 'text-tertiary line-through' : 'text-primary'
                )}
              >
                {subtask.text}
              </span>
              <button
                type="button"
                onClick={() => onRemove(subtask.id)}
                className="flex-shrink-0 p-0.5 text-secondary hover:text-red-500 transition-colors rounded opacity-0 group-hover/sub:opacity-100 focus:opacity-100"
                aria-label={`Remove "${subtask.text}"`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-tertiary flex-shrink-0" />
            <input
              type="text"
              aria-label="Add a subtask"
              placeholder="Add a subtask"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              maxLength={200}
              className="flex-1 text-sm px-2 py-1 bg-transparent border-b border-border focus:border-primary-500 focus:outline-none text-primary placeholder:text-tertiary"
            />
          </form>
        </div>
      )}
    </div>
  );
};
