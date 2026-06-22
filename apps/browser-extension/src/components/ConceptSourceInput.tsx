import { Input } from '@cuewise/ui';
import { BookOpen } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface ConceptSourceInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Existing sources across the deck, offered as suggestions (deduped, sorted). */
  suggestions: string[];
}

/** Source field with a small "your sources" suggestion list to avoid dupes. */
export const ConceptSourceInput: React.FC<ConceptSourceInputProps> = ({
  value,
  onChange,
  suggestions,
}) => {
  const [focused, setFocused] = useState(false);
  const query = value.trim().toLowerCase();
  const matches = suggestions
    .filter((source) => source.toLowerCase().includes(query) && source.toLowerCase() !== query)
    .slice(0, 5);
  const open = focused && matches.length > 0;

  return (
    <div className="relative">
      <Input
        id="concept-source"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Search or type a source…"
        maxLength={200}
        aria-label="Source"
      />
      {open && (
        <div className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-10 flex flex-col gap-0.5 rounded-lg border border-border bg-surface-elevated p-1.5 shadow-xl">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-tertiary">
            Your sources
          </div>
          {matches.map((source) => (
            <button
              key={source}
              type="button"
              // onMouseDown so the pick lands before the input's onBlur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(source);
              }}
              className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-primary hover:bg-surface-variant"
            >
              <BookOpen className="h-3.5 w-3.5 text-secondary" /> {source}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
