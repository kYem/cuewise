import { MAX_NOTE_LENGTH, truncateNote } from '@cuewise/shared';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { Maximize2, Minimize2, NotebookPen, Pin, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { HOME_TILE_CLASS } from './home-tile';

const SAVE_DEBOUNCE_MS = 500;
const SAVED_BADGE_MS = 1500;
// Show the count only once it could plausibly bite; a permanent counter is clutter on an
// ambient pad.
const COUNT_VISIBLE_FROM = MAX_NOTE_LENGTH - 500;

const HEADER_BTN_CLASS = 'text-secondary hover:text-primary transition-colors';

export const NotesWidget: React.FC = () => {
  const note = useSettingsStore((state) => state.settings.note);
  const expanded = useSettingsStore((state) => state.settings.notesExpanded);
  const pinned = useSettingsStore((state) => state.settings.notesPinned);
  const isLoading = useSettingsStore((state) => state.isLoading);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(note);
  const [justSaved, setJustSaved] = useState(false);
  // Outlives the toast: a failed save otherwise looks saved once the toast expires.
  const [saveFailed, setSaveFailed] = useState(false);

  // The debounce owns the newest text; flushing reads it rather than a captured render's value.
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didAutoOpen = useRef(false);
  const autoOpening = useRef(false);

  const persist = useCallback(async () => {
    const value = pending.current;
    if (value === null) {
      return;
    }
    // maxLength only bounds typing; a pull can deliver a note longer than this device would let
    // you write. Never persist past our own cap.
    const ok = await updateSettings({ note: truncateNote(value) });
    // Left pending on failure so the next flush or keystroke retries it; updateSettings has
    // already told the user.
    if (!ok) {
      setSaveFailed(true);
      return;
    }
    setSaveFailed(false);
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

  // A pending debounce dies with the tab, taking the last sentence typed with it. Best effort:
  // teardown can still pre-empt the write chain, and the debounce keeps that window under 500ms.
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
    // A pad the user already opened has no autofocus to suppress; a latched flag would swallow
    // the next open's.
    if (!isOpen) {
      autoOpening.current = true;
      setIsOpen(true);
    }
  }, [isLoading, pinned, isOpen]);

  useEffect(() => {
    if (!justSaved) {
      return;
    }
    const id = setTimeout(() => setJustSaved(false), SAVED_BADGE_MS);
    return () => clearTimeout(id);
  }, [justSaved]);

  // Every close unpins: the pad reopens from `notesPinned` on every mount, so a close that left
  // the pin behind — the trigger pill included — would spring the pad back on the next tab.
  const closePad = async () => {
    flush();
    if (pinned) {
      const ok = await updateSettings({ notesPinned: false });
      // Stays open: closed-but-still-pinned is that same surprise, and the store already toasted.
      if (!ok) {
        return;
      }
    }
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    // Nothing read from settings is trustworthy yet while loading, so an early open must not
    // latch — the auto-open effect still has to reconcile once the real values land.
    if (!isLoading) {
      didAutoOpen.current = true;
    }
    if (open) {
      setIsOpen(true);
      return;
    }
    void closePad();
  };

  // No optimistic flip or rollback: the store commits only writes that persisted.
  const toggleExpanded = () => {
    void updateSettings({ notesExpanded: !expanded });
  };

  const togglePinned = () => {
    void updateSettings({ notesPinned: !pinned });
  };

  // A pinned pad ignores click-away and Escape; the X button and the trigger still close it.
  const keepOpen = (event: Event | KeyboardEvent) => {
    if (pinned) {
      event.preventDefault();
    }
  };

  // A pad that opened on its own must not take the caret out of the address bar.
  const suppressAutoOpenFocus = (event: Event) => {
    if (autoOpening.current) {
      autoOpening.current = false;
      event.preventDefault();
    }
  };

  const hasNote = draft.trim().length > 0;

  let statusText = '';
  if (saveFailed) {
    statusText = 'Not saved';
  } else if (justSaved) {
    statusText = 'Saved';
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Notes" title="Notes" className={HOME_TILE_CLASS}>
          <NotebookPen className={cn('h-5 w-5', hasNote ? 'text-primary-600' : 'text-secondary')} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'p-0 bg-surface/95 backdrop-blur-xl transition-[width] duration-150',
          expanded ? 'w-[32rem]' : 'w-72'
        )}
        align="start"
        onInteractOutside={keepOpen}
        onEscapeKeyDown={keepOpen}
        onOpenAutoFocus={suppressAutoOpenFocus}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-medium text-primary">Notes</span>
          <div className="flex items-center gap-2">
            <span
              aria-live="polite"
              className={cn('text-xs', saveFailed ? 'text-red-500' : 'text-secondary')}
            >
              {statusText}
            </span>
            <button
              type="button"
              onClick={togglePinned}
              aria-pressed={pinned}
              aria-label={pinned ? 'Unpin notes' : 'Keep notes open'}
              title={pinned ? 'Unpin — closes on click away' : 'Keep open'}
              className={cn(HEADER_BTN_CLASS, pinned && 'text-primary-600')}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleExpanded}
              aria-label={expanded ? 'Shrink notes' : 'Expand notes'}
              title={expanded ? 'Shrink notes' : 'Expand notes'}
              className={HEADER_BTN_CLASS}
            >
              {expanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
            {pinned && (
              <button
                type="button"
                onClick={() => void closePad()}
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
            expanded ? 'h-[60vh]' : 'h-40'
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
