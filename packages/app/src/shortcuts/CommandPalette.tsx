import { cn } from '@cuewise/ui';
import { Search } from 'lucide-react';
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyCaps } from './ShortcutCheatSheet';
import type { Shortcut, ShortcutId } from './shortcut-table';

export function filterShortcuts(shortcuts: Shortcut[], query: string): Shortcut[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return shortcuts;
  }
  const byLabel = shortcuts.filter((s) => s.label.toLowerCase().includes(needle));
  const byKeyword = shortcuts.filter(
    (s) => !byLabel.includes(s) && s.keywords.some((keyword) => keyword.includes(needle))
  );
  return [...byLabel, ...byKeyword];
}

export const CommandPalette: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  shortcuts: Shortcut[];
  onRun: (id: ShortcutId) => void;
}> = ({ isOpen, onClose, shortcuts, onRun }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = filterShortcuts(shortcuts, query);
  // The list can shrink under the selection while open, when a live action goes away.
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  const activeResult = results[activeIndex];
  const hasResults = results.length > 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    // Here, not in `close`: the provider can also shut the palette (a second Cmd/Ctrl+K).
    return () => {
      setQuery('');
      setActive(0);
      returnFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const close = onClose;

  const choose = (shortcut: Shortcut | undefined) => {
    if (shortcut === undefined) {
      return;
    }
    close();
    onRun(shortcut.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) {
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + results.length) % results.length);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      choose(activeResult);
    }
  };

  // The search box is the only stop: Tab stays on it rather than reaching the page behind.
  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      inputRef.current?.focus();
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh] animate-fade-in">
      <button
        type="button"
        aria-label="Close command palette"
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={handleDialogKeyDown}
        className="relative w-full max-w-lg rounded-2xl bg-surface-elevated shadow-2xl border border-border overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <Search className="w-4 h-4 text-secondary" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Search commands"
            aria-expanded={hasResults}
            aria-controls={hasResults ? listId : undefined}
            aria-activedescendant={
              activeResult === undefined ? undefined : `${listId}-${activeResult.id}`
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command"
            className="flex-1 py-3 bg-transparent text-primary placeholder:text-tertiary focus:outline-none"
          />
        </div>
        {!hasResults ? (
          <p className="px-4 py-6 text-sm text-secondary text-center">No matching commands</p>
        ) : (
          <div
            id={listId}
            role="listbox"
            aria-label="Commands"
            className="max-h-80 overflow-y-auto py-1"
          >
            {results.map((shortcut, index) => (
              <div
                key={shortcut.id}
                id={`${listId}-${shortcut.id}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(shortcut)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    choose(shortcut);
                  }
                }}
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-2 text-sm text-primary cursor-pointer',
                  index === activeIndex && 'bg-primary-100/60'
                )}
              >
                {shortcut.label}
                <KeyCaps keys={shortcut.keys} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
