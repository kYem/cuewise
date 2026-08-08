import { MAX_NOTE_LENGTH } from '@cuewise/shared';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { Maximize2, Minimize2, NotebookPen, Pin, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';

const SAVE_DEBOUNCE_MS = 500;
const SAVED_BADGE_MS = 1500;
// Show the count only once it could plausibly bite; a permanent counter is clutter on an
// ambient pad.
const COUNT_VISIBLE_FROM = MAX_NOTE_LENGTH - 500;

const TILE_CLASS =
  'flex h-10 w-10 items-center justify-center rounded-full bg-surface/80 backdrop-blur-sm shadow-md hover:shadow-lg hover:scale-110 transition-all';

const HEADER_BTN_CLASS = 'text-secondary hover:text-primary transition-colors';

export const NotesWidget: React.FC = () => {
  const note = useSettingsStore((state) => state.settings.note);
  const expanded = useSettingsStore((state) => state.settings.notesExpanded);
  const pinned = useSettingsStore((state) => state.settings.notesPinned);
  const isLoading = useSettingsStore((state) => state.isLoading);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(note);
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [isPinned, setIsPinned] = useState(pinned);
  const [justSaved, setJustSaved] = useState(false);

  // The debounce owns the newest text; flushing reads it rather than a captured render's value.
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didAutoOpen = useRef(false);

  const persist = useCallback(async () => {
    const value = pending.current;
    if (value === null) {
      return;
    }
    // maxLength only bounds typing; a pull can deliver a note longer than this device would let
    // you write. Never persist past our own cap.
    const ok = await updateSettings({ note: value.slice(0, MAX_NOTE_LENGTH) });
    // Left pending on failure so the next flush or keystroke retries it; updateSettings has
    // already told the user.
    if (!ok) {
      return;
    }
    if (pending.current === value) {
      pending.current = null;
      setJustSaved(true);
    }
  }, [updateSettings]);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void persist();
  }, [persist]);

  const handleChange = (value: string) => {
    // Paired with readOnly below: nothing may reach `pending` before the stored note lands, or
    // the real note is refused on arrival as though it were stale.
    if (isLoading) {
      return;
    }
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

  // Latest-ref so the listener below stays mount-only whatever `flush`'s identity does. Stable
  // today, since updateSettings is defined once by the store.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // A pending debounce dies with the tab, taking the last sentence typed with it.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        flushRef.current();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flushRef.current();
    };
  }, []);

  // A pull can rewrite the note under an open pad. Adopting it over unsaved text would swap the
  // pad's contents for a value the next flush is about to overwrite anyway.
  useEffect(() => {
    if (pending.current === null) {
      setDraft(note);
    }
  }, [note]);

  // Pinned means "stays open", and every new tab is a fresh mount — so reopen it once settings say
  // it was left pinned, the way the reminders panel does.
  useEffect(() => {
    if (isLoading || didAutoOpen.current || !pinned) {
      return;
    }
    didAutoOpen.current = true;
    setIsPinned(true);
    setIsExpanded(expanded);
    setIsOpen(true);
  }, [isLoading, pinned, expanded]);

  useEffect(() => {
    if (!justSaved) {
      return;
    }
    const id = setTimeout(() => setJustSaved(false), SAVED_BADGE_MS);
    return () => clearTimeout(id);
  }, [justSaved]);

  const handleOpenChange = (open: boolean) => {
    // Latches on the first deliberate open or close: once the user has driven the pad, a later
    // settings change must never spring it back open.
    didAutoOpen.current = true;
    setIsOpen(open);
    if (open) {
      setIsExpanded(expanded);
      setIsPinned(pinned);
      return;
    }
    flush();
  };

  const toggleExpanded = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    void updateSettings({ notesExpanded: next });
  };

  const togglePinned = () => {
    const next = !isPinned;
    setIsPinned(next);
    void updateSettings({ notesPinned: next });
  };

  // A pinned pad ignores click-away and Escape, so it needs a way out that isn't the trigger.
  const keepOpen = (event: Event | KeyboardEvent) => {
    if (isPinned) {
      event.preventDefault();
    }
  };

  const hasNote = draft.trim().length > 0;

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
        onInteractOutside={keepOpen}
        onEscapeKeyDown={keepOpen}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-medium text-primary">Notes</span>
          <div className="flex items-center gap-2">
            <span aria-live="polite" className="text-xs text-secondary">
              {justSaved ? 'Saved' : ''}
            </span>
            <button
              type="button"
              onClick={togglePinned}
              aria-pressed={isPinned}
              aria-label={isPinned ? 'Unpin notes' : 'Keep notes open'}
              title={isPinned ? 'Unpin — closes on click away' : 'Keep open'}
              className={cn(HEADER_BTN_CLASS, isPinned && 'text-primary-600')}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleExpanded}
              aria-label={isExpanded ? 'Shrink notes' : 'Expand notes'}
              title={isExpanded ? 'Shrink notes' : 'Expand notes'}
              className={HEADER_BTN_CLASS}
            >
              {isExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
            {isPinned && (
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                aria-label="Close notes"
                title="Close notes"
                className={HEADER_BTN_CLASS}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <textarea
          aria-label="Notes"
          value={draft}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={isLoading ? 'Loading…' : 'Jot something down…'}
          readOnly={isLoading}
          maxLength={MAX_NOTE_LENGTH}
          className={cn(
            'w-full resize-none bg-transparent px-3 py-2.5 text-sm text-primary placeholder:text-secondary focus:outline-none',
            isExpanded ? 'h-[60vh]' : 'h-40'
          )}
        />
        {draft.length >= COUNT_VISIBLE_FROM && (
          <p
            className={cn(
              'px-3 pb-2 text-xs',
              draft.length > MAX_NOTE_LENGTH ? 'text-red-500' : 'text-secondary'
            )}
          >
            {draft.length > MAX_NOTE_LENGTH
              ? `Over the limit — saving keeps the first ${MAX_NOTE_LENGTH} characters`
              : `${draft.length}/${MAX_NOTE_LENGTH} characters`}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};
