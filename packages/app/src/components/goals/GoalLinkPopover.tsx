import type { Goal } from '@cuewise/shared';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { Check, Flag, Link2 } from 'lucide-react';
import type React from 'react';

interface GoalLinkPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The task's currently linked goal, if any. */
  parentId?: string;
  activeGoals: Goal[];
  /** Called with the picked goal id, or null to remove the link. */
  onSelect: (goalId: string | null) => void;
  /** The row's edit input — pointer interactions here must never blur it. */
  editInputRef: React.RefObject<HTMLInputElement>;
}

// WebKit doesn't focus buttons on mouse click, so without this the edit input
// blurs with relatedTarget=null, the row's blur guard ends editing, and this
// popover unmounts before the click lands (Chromium passes the guard by luck).
function keepEditFocus(e: React.MouseEvent): void {
  e.preventDefault();
}

/**
 * The edit-row "Link to goal" picker, shared by GoalsList and AllGoalsList.
 * Only rendered while its row is in edit mode.
 */
export function GoalLinkPopover({
  open,
  onOpenChange,
  parentId,
  activeGoals,
  onSelect,
  editInputRef,
}: GoalLinkPopoverProps): React.JSX.Element {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseDown={keepEditFocus}
          className={cn(
            'p-1 transition-colors focus:outline-none rounded',
            parentId
              ? 'text-primary-600 hover:text-primary-700'
              : 'text-secondary hover:text-primary-600'
          )}
          aria-label={parentId ? 'Change linked goal' : 'Link to goal'}
          title={parentId ? 'Change linked goal' : 'Link to goal'}
        >
          <Link2 className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="min-w-[180px] py-1 bg-surface/95 backdrop-blur-xl"
        onOpenAutoFocus={(e) => {
          // Pointer opens keep typing focus in the row; keyboard opens (focus sits
          // on the trigger, not the input) keep Radix's focus-into-content.
          if (document.activeElement === editInputRef.current) {
            e.preventDefault();
          }
        }}
      >
        {parentId && (
          <button
            type="button"
            onMouseDown={keepEditFocus}
            onClick={() => onSelect(null)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <span>Remove link</span>
          </button>
        )}
        {activeGoals.map((goal) => {
          const isLinked = parentId === goal.id;
          return (
            <button
              key={goal.id}
              type="button"
              onMouseDown={keepEditFocus}
              onClick={() => onSelect(goal.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                isLinked
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-primary hover:bg-surface-variant'
              )}
            >
              <Flag className="w-3 h-3 flex-shrink-0" />
              <span className="flex-1 truncate">{goal.text}</span>
              {isLinked && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
