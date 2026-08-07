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
  if (event.key !== ' ' || !isShortcutKeyEvent(event)) {
    return false;
  }
  const target = event.target;
  if (target instanceof Element) {
    return target.closest('button, [role="button"], summary') === null;
  }
  return true;
}
