import { afterEach, describe, expect, it } from 'vitest';
import { isShortcutKeyEvent, isSpaceShortcutEvent } from './keyboard-shortcut';

function dispatch(
  predicate: (event: KeyboardEvent) => boolean,
  key: string,
  options: { on?: HTMLElement; metaKey?: boolean; repeat?: boolean } = {}
): boolean {
  const target = options.on ?? document.body;
  let allowed = false;
  const handler = (event: KeyboardEvent) => {
    allowed = predicate(event);
  };
  document.addEventListener('keydown', handler);
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      metaKey: options.metaKey,
      repeat: options.repeat,
    })
  );
  document.removeEventListener('keydown', handler);
  return allowed;
}

function press(options: { on?: HTMLElement; metaKey?: boolean; repeat?: boolean } = {}): boolean {
  return dispatch(isShortcutKeyEvent, 'c', options);
}

function pressSpace(options: { on?: HTMLElement } = {}): boolean {
  return dispatch(isSpaceShortcutEvent, ' ', options);
}

function appendWith(tag: string, attributes: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
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

describe('isSpaceShortcutEvent', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('allows a bare space', () => {
    expect(pressSpace()).toBe(true);
  });

  it('rejects any other key', () => {
    expect(dispatch(isSpaceShortcutEvent, 'c')).toBe(false);
  });

  it('inherits the shared guards, so typing is still exempt', () => {
    expect(pressSpace({ on: appendWith('input') })).toBe(false);
  });

  // preventDefault on a space keydown cancels the focused control's own activation,
  // so claiming the key here would replace what the user aimed at.
  it.each([
    ['a button', 'button', {}],
    ['a role=button control', 'div', { role: 'button' }],
    ['a summary', 'summary', {}],
  ])('leaves space to %s', (_label, tag, attributes) => {
    expect(pressSpace({ on: appendWith(tag, attributes) })).toBe(false);
  });

  it('leaves space to a control the target sits inside', () => {
    const button = appendWith('button');
    const icon = document.createElement('span');
    button.appendChild(icon);

    expect(pressSpace({ on: icon })).toBe(false);
  });
});
