import { addTag } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Plus, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface ConceptTagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Existing tags across the deck, offered as suggestions (deduped, sorted). */
  suggestions: string[];
  /** Mirrors the uncommitted draft so the form can fold it in on submit. */
  onDraftChange?: (value: string) => void;
}

/**
 * Chip-based tag editor: type to search existing tags or add a new one (Enter or
 * comma commits; Backspace on an empty field removes the last chip). Suggestions
 * come from the user's other cards so tagging stays consistent.
 */
export const ConceptTagInput: React.FC<ConceptTagInputProps> = ({
  tags,
  onChange,
  suggestions,
  onDraftChange,
}) => {
  const [draft, setDraftState] = useState('');

  const setDraft = (value: string) => {
    setDraftState(value);
    onDraftChange?.(value);
  };

  const commit = (value?: string) => {
    const updated = addTag(tags, value ?? draft);
    if (updated !== tags) {
      onChange(updated);
    }
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft.length === 0 && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const pool = suggestions.filter((tag) => !tags.includes(tag));
  const query = draft.trim().toLowerCase();
  const filtered = (
    query.length > 0 ? pool.filter((tag) => tag.toLowerCase().includes(query)) : pool
  ).slice(0, 8);
  const showCreate =
    query.length > 0 &&
    !pool.some((tag) => tag.toLowerCase() === query) &&
    !tags.some((tag) => tag.toLowerCase() === query);

  return (
    <div>
      <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-variant px-2 py-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              aria-label={`Remove ${tag}`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-secondary hover:bg-surface-variant hover:text-primary"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          id="concept-tags"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commit()}
          placeholder={tags.length > 0 ? '' : 'Type to search or add a tag…'}
          aria-label="Tags"
          className="min-w-[130px] flex-1 bg-transparent px-1 py-1 text-sm text-primary outline-none placeholder:text-tertiary"
        />
      </div>

      {(filtered.length > 0 || showCreate) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {showCreate && (
            <button
              type="button"
              // onMouseDown so the chip commits before the input's onBlur fires.
              onMouseDown={(e) => {
                e.preventDefault();
                commit(draft);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary-600/50 px-2.5 py-1 text-xs font-medium text-primary-600"
            >
              <Plus className="h-3 w-3" /> Add “{draft.trim()}”
            </button>
          )}
          {filtered.map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(tag);
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-border bg-surface-variant px-2.5 py-1 text-xs font-medium text-secondary',
                'hover:text-primary'
              )}
            >
              <Plus className="h-3 w-3" /> {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
