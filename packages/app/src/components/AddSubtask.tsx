import { Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface AddSubtaskProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAdd: (text: string) => void;
}

/** An "Add subtask" button that opens an inline field: Enter or blur saves, Escape discards. */
export const AddSubtask: React.FC<AddSubtaskProps> = ({ open, onOpen, onClose, onAdd }) => {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const close = (save: boolean) => {
    const text = draft.trim();
    if (save && text) {
      onAdd(text);
    }
    setDraft('');
    onClose();
  };

  if (!open) {
    return (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOpen}
        aria-label="Add subtask"
        className="flex items-center gap-1 text-xs text-tertiary hover:text-primary-600 transition-colors"
      >
        <Plus className="w-3 h-3" />
        <span>Add subtask</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        close(true);
      }}
      className="flex items-center gap-2"
    >
      <Plus className="w-4 h-4 text-tertiary flex-shrink-0" />
      <input
        ref={inputRef}
        type="text"
        aria-label="Add a subtask"
        placeholder="Add a subtask"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            close(false);
          }
        }}
        onBlur={() => close(true)}
        maxLength={200}
        className="min-w-0 flex-1 border-b border-border bg-transparent px-2 py-1 text-sm text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none"
      />
    </form>
  );
};
