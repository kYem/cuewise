import { MAX_NOTE_LENGTH } from '@cuewise/shared';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { Maximize2, Minimize2, NotebookPen } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';

const SAVE_DEBOUNCE_MS = 500;
const SAVED_BADGE_MS = 1500;

const TILE_CLASS =
  'flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 backdrop-blur-sm shadow-md hover:shadow-lg hover:scale-110 transition-all';

export const NotesWidget: React.FC = () => {
  const note = useSettingsStore((state) => state.settings.note);
  const expanded = useSettingsStore((state) => state.settings.notesExpanded);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(note);
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [justSaved, setJustSaved] = useState(false);

  // The debounce owns the newest text; flushing reads it rather than a captured render's value.
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async () => {
    const value = pending.current;
    if (value === null) {
      return;
    }
    const ok = await updateSettings({ note: value });
    // Left pending on failure so the next flush or keystroke retries it; updateSettings has
    // already told the user. Cleared only if no newer keystroke replaced it meanwhile.
    if (!ok) {
      return;
    }
    if (pending.current === value) {
      pending.current = null;
    }
    setJustSaved(true);
  }, [updateSettings]);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void persist();
  }, [persist]);

  const handleChange = (value: string) => {
    setDraft(value);
    setJustSaved(false);
    pending.current = value;
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      void persist();
    }, SAVE_DEBOUNCE_MS);
  };

  // A pending debounce dies with the tab, taking the last sentence typed with it.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  // A pull can rewrite the note under an open pad. Adopt it unless this device has unsaved text,
  // or the next keystroke writes a value the user was never shown over the one they were sent.
  useEffect(() => {
    if (pending.current === null) {
      setDraft(note);
    }
  }, [note]);

  useEffect(() => {
    if (!justSaved) {
      return;
    }
    const id = setTimeout(() => setJustSaved(false), SAVED_BADGE_MS);
    return () => clearTimeout(id);
  }, [justSaved]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Unsaved text outranks the stored value, which is older by definition.
      if (pending.current === null) {
        setDraft(note);
      }
      setIsExpanded(expanded);
      return;
    }
    flush();
  };

  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    void updateSettings({ notesExpanded: next });
  };

  const hasNote = note.trim().length > 0;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Notes" title="Notes" className={TILE_CLASS}>
          <NotebookPen className={cn('h-5 w-5', hasNote ? 'text-primary-600' : 'text-secondary')} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'p-0 bg-surface/95 backdrop-blur-xl transition-[width] duration-150',
          isExpanded ? 'w-[32rem]' : 'w-72'
        )}
        align="start"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-medium text-primary">Notes</span>
          <div className="flex items-center gap-2">
            <span aria-live="polite" className="text-xs text-secondary">
              {justSaved ? 'Saved' : ''}
            </span>
            <button
              type="button"
              onClick={toggleExpanded}
              aria-label={isExpanded ? 'Shrink notes' : 'Expand notes'}
              title={isExpanded ? 'Shrink notes' : 'Expand notes'}
              className="text-secondary hover:text-primary transition-colors"
            >
              {isExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
        <textarea
          aria-label="Notes"
          value={draft}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="Jot something down…"
          maxLength={MAX_NOTE_LENGTH}
          className={cn(
            'w-full resize-none bg-transparent px-3 py-2.5 text-sm text-primary placeholder:text-secondary focus:outline-none',
            isExpanded ? 'h-[60vh]' : 'h-40'
          )}
        />
      </PopoverContent>
    </Popover>
  );
};
