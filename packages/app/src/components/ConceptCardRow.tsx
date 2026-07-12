import { type ConceptCard, type ConceptDifficulty, getConceptDifficulty } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Pencil, Trash2 } from 'lucide-react';
import type React from 'react';

// Left-edge tint by difficulty; 'new' (never reviewed) carries no accent.
const DIFFICULTY_ACCENT: Record<ConceptDifficulty, string> = {
  new: '',
  struggling: 'border-l-4 border-l-error',
  solid: 'border-l-4 border-l-warning',
  strong: 'border-l-4 border-l-success',
};

interface ConceptCardRowProps {
  card: ConceptCard;
  due: boolean;
  isConfirmingDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export const ConceptCardRow: React.FC<ConceptCardRowProps> = ({
  card,
  due,
  isConfirmingDelete,
  onEdit,
  onDelete,
}) => (
  <li
    className={cn(
      'rounded-xl border border-border bg-surface p-4',
      DIFFICULTY_ACCENT[getConceptDifficulty(card)]
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-primary">{card.term}</h3>
          <span
            className={cn(
              'text-[11px] font-semibold px-2 py-0.5 rounded-full',
              due ? 'bg-primary-600/15 text-primary-600' : 'bg-surface-variant text-secondary'
            )}
          >
            {due ? 'Due now' : `Due ${card.schedule.dueDate}`}
          </span>
        </div>
        <p className="mt-1 text-sm text-secondary line-clamp-2">{card.definition}</p>
        {card.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] px-2 py-0.5 rounded-full bg-surface-variant text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-xs text-tertiary">
          {card.schedule.repetitions} reviews · interval {card.schedule.interval}d
        </p>
      </div>
      <div className="flex items-center gap-1 flex-none">
        <button
          type="button"
          onClick={onEdit}
          className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-variant transition-colors"
          title="Edit"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className={cn(
            'p-2 rounded-lg transition-colors',
            isConfirmingDelete
              ? 'bg-surface-variant text-error'
              : 'text-secondary hover:text-error hover:bg-surface-variant'
          )}
          title={isConfirmingDelete ? 'Click again to delete' : 'Delete'}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  </li>
);
