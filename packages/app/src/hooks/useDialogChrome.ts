import { useEffect, useEffectEvent } from 'react';

interface DialogChromeOptions {
  open: boolean;
  onClose: () => void;
  /** Return true to keep the dialog open for this Escape press. */
  ignoreEscape?: (event: KeyboardEvent) => boolean;
}

// Shared across dialogs: React cleans up a deleted tree parent-first, so per-dialog restores of
// the overflow each saw on open would leave nested ones stuck at 'hidden'.
let scrollLocks = 0;
let overflowBeforeLock = '';

function lockBodyScroll(): () => void {
  if (scrollLocks === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks++;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    scrollLocks--;
    if (scrollLocks === 0) {
      document.body.style.overflow = overflowBeforeLock;
    }
  };
}

/** While `open`: Escape calls `onClose`, and body scroll is locked until the last dialog closes. */
export function useDialogChrome({ open, onClose, ignoreEscape }: DialogChromeOptions): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape' && !ignoreEscape?.(event)) {
      onClose();
    }
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    const unlockScroll = lockBodyScroll();
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      unlockScroll();
    };
  }, [open]);
}
