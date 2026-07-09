import { Brain, Plus, X } from 'lucide-react';
import type React from 'react';

interface ConceptNudgeProps {
  onAdd: () => void;
  onDismiss: () => void;
}

/** A calm, dismissible chip that introduces concept cards to engaged users. */
export const ConceptNudge: React.FC<ConceptNudgeProps> = ({ onAdd, onDismiss }) => {
  return (
    <div className="mx-auto flex max-w-xl items-center gap-3 rounded-full border border-border bg-surface/80 px-4 py-2 shadow-md backdrop-blur-sm">
      <Brain className="h-4 w-4 flex-none text-primary-600" />
      <span className="text-sm text-primary">
        Remembering what you read? Save a concept and Cuewise will help it stick.
      </span>
      <button
        type="button"
        onClick={onAdd}
        className="ml-auto inline-flex flex-none items-center gap-1 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-700"
      >
        <Plus className="h-3.5 w-3.5" /> Add a concept
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-none rounded-full p-1 text-secondary transition-colors hover:bg-surface-variant hover:text-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
