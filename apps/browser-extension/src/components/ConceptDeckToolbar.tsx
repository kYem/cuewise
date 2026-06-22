import { cn, Input } from '@cuewise/ui';
import type React from 'react';

interface ConceptDeckToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  tags: string[];
  activeTag: string | null;
  onToggleTag: (tag: string) => void;
}

export const ConceptDeckToolbar: React.FC<ConceptDeckToolbarProps> = ({
  query,
  onQueryChange,
  tags,
  activeTag,
  onToggleTag,
}) => (
  <div className="mb-4 space-y-3">
    <Input
      type="text"
      value={query}
      onChange={(e) => onQueryChange(e.target.value)}
      placeholder="Search concepts…"
      aria-label="Search concepts"
    />
    {tags.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onToggleTag(tag)}
            className={cn(
              'text-xs px-2.5 py-1 rounded-full transition-colors',
              activeTag === tag
                ? 'bg-primary-600 text-white'
                : 'bg-surface-variant text-secondary hover:text-primary'
            )}
          >
            {tag}
          </button>
        ))}
      </div>
    ) : null}
  </div>
);
