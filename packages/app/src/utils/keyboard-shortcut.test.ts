import { afterEach, describe, expect, it } from 'vitest';
import { isShortcutKeyEvent } from './keyboard-shortcut';

function press(options: { on?: HTMLElement; metaKey?: boolean; repeat?: boolean } = {}): boolean {
  const target = options.on ?? document.body;
  let allowed = false;
  const handler = (event: KeyboardEvent) => {
    allowed = isShortcutKeyEvent(event);
  };
  document.addEventListener('keydown', handler);
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'c',
      bubbles: true,
      metaKey: options.metaKey,
      repeat: options.repeat,
    })
  );
  document.removeEventListener('keydown', handler);
  return allowed;
}

describe('isShortcutKeyEvent', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('allows a bare keypress', () => {
    expect(press()).toBe(true);
  });

  it('rejects a modifier combo', () => {
    expect(press({ metaKey: true })).toBe(false);
  });

  it('rejects an auto-repeat, which the OS emits tens of times a second', () => {
    expect(press({ repeat: true })).toBe(false);
  });

  it('rejects keypresses aimed at a text field', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    expect(press({ on: input })).toBe(false);
  });

  it('rejects keypresses in a contenteditable', () => {
    const editable = document.createElement('div');
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);

    expect(press({ on: editable })).toBe(false);
  });

  it('rejects keypresses while a modal dialog is open', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);

    expect(press()).toBe(false);
  });

  it('allows keypresses while a non-modal dialog-role popover is open', () => {
    const popover = document.createElement('div');
    popover.setAttribute('role', 'dialog');
    document.body.appendChild(popover);

    expect(press()).toBe(true);
  });
});
