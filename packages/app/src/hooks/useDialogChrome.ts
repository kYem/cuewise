import { useEffect, useEffectEvent } from 'react';

interface DialogChromeOptions {
  open: boolean;
  onClose: () => void;
  /** Return true to keep the dialog open for this Escape press. */
  ignoreEscape?: (event: KeyboardEvent) => boolean;
}

/** While `open`: Escape calls `onClose`, and body scroll is locked, restoring the prior overflow. */
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
    const previousOverflow = document.body.style.overflow;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
}
