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
 * Space, as a page-level shortcut. Distinct from `isShortcutKeyEvent` because a focused
 * button already activates on space natively — handling it again would fire twice.
 */
export function isSpaceShortcutEvent(event: KeyboardEvent): boolean {
  if (event.key !== ' ' || !isShortcutKeyEvent(event)) {
    return false;
  }
  return (event.target as HTMLElement | null)?.tagName !== 'BUTTON';
}
