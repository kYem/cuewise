import type React from 'react';

/** Whether the key went to a field the user is typing in, so the keypress is theirs, not the page's. */
export function isTextEntryEvent(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return (
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.tagName === 'SELECT' ||
    (target?.isContentEditable ?? false)
  );
}

const claimed = new WeakSet<Event>();

/** Marks a keypress one shortcut acted on, so every other shortcut listener lets it pass. */
export function claimShortcutEvent(event: Event): void {
  claimed.add(event);
}

function isModalOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/** A bare keypress that should drive a shortcut: no modifiers, not typing, no modal open. */
export function isShortcutKeyEvent(event: KeyboardEvent): boolean {
  if (claimed.has(event)) {
    return false;
  }
  // `repeat` excluded too: holding the key is one intent, not one per auto-repeat tick.
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }
  if (isTextEntryEvent(event)) {
    return false;
  }
  return !isModalOpen();
}

export function isMacPlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac/i.test(nav.userAgentData?.platform ?? nav.platform ?? '');
}

/** Cmd+K on macOS, Ctrl+K elsewhere — allowed while typing, which is where people reach for it. */
export function isPaletteKeyEvent(event: KeyboardEvent, mac = isMacPlatform()): boolean {
  if (event.key !== 'k' || event.repeat || event.altKey || event.shiftKey) {
    return false;
  }
  const primary = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return primary && !isModalOpen();
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
