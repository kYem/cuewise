import type React from 'react';

/** A bare keypress that should drive a shortcut: no modifiers, not typing, no modal open. */
export function isShortcutKeyEvent(event: KeyboardEvent): boolean {
  // `repeat` excluded too: holding the key is one intent, not one per auto-repeat tick.
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }
  const target = event.target as HTMLElement | null;
  if (
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.tagName === 'SELECT' ||
    target?.isContentEditable
  ) {
    return false;
  }
  return document.querySelector('[role="dialog"][aria-modal="true"]') === null;
}

/**
 * Space, as a page-level shortcut. Skips a focused button, role=button or summary:
 * space belongs to the control the user is on, which already does its own thing with it.
 */
export function isSpaceShortcutEvent(event: KeyboardEvent): boolean {
  // shiftKey excluded: Shift+Space is Page Up, and the page scrolls.
  if (event.key !== ' ' || event.shiftKey || !isShortcutKeyEvent(event)) {
    return false;
  }
  const target = event.target;
  if (target instanceof Element) {
    return target.closest('button, [role="button"], summary') === null;
  }
  return true;
}

/**
 * Space is a page shortcut, but a focused control keeps it — and Chromium leaves focus on a
 * clicked button, so the next press silently re-fires it. Pointer clicks only: blurring a
 * keyboard activation would strand the user at the top of the page.
 */
export const releaseFocusOnPointer =
  (onClick: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail > 0) {
      e.currentTarget.blur();
    }
    onClick();
  };
