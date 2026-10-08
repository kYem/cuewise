import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimShortcutEvent,
  isMacPlatform,
  isPaletteKeyEvent,
  isShortcutKeyEvent,
  isSpaceShortcutEvent,
} from './keyboard-shortcut';

function dispatch(
  predicate: (event: KeyboardEvent) => boolean,
  key: string,
  options: {
    on?: HTMLElement;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    repeat?: boolean;
    shiftKey?: boolean;
  } = {}
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
      ctrlKey: options.ctrlKey,
      altKey: options.altKey,
      repeat: options.repeat,
      shiftKey: options.shiftKey,
    })
  );
  document.removeEventListener('keydown', handler);
  return allowed;
}

function press(options: { on?: HTMLElement; metaKey?: boolean; repeat?: boolean } = {}): boolean {
  return dispatch(isShortcutKeyEvent, 'c', options);
}

function pressSpace(options: { on?: HTMLElement; shiftKey?: boolean } = {}): boolean {
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

  it.each([
    ['a button', 'button', {}],
    ['a role=button control', 'div', { role: 'button' }],
    ['a summary', 'summary', {}],
  ])('leaves space to %s', (_label, tag, attributes) => {
    expect(pressSpace({ on: appendWith(tag, attributes) })).toBe(false);
  });

  it('leaves shift+space alone, since that is page up', () => {
    expect(pressSpace({ shiftKey: true })).toBe(false);
  });

  it('leaves space to a control the target sits inside', () => {
    const button = appendWith('button');
    const icon = document.createElement('span');
    button.appendChild(icon);

    expect(pressSpace({ on: icon })).toBe(false);
  });
});

describe('claimShortcutEvent', () => {
  it('makes the shared guards reject an event a shortcut already handled', () => {
    const claimFirst = (event: KeyboardEvent) => claimShortcutEvent(event);
    document.addEventListener('keydown', claimFirst, true);

    const shortcut = press();
    const space = pressSpace();
    document.removeEventListener('keydown', claimFirst, true);

    expect(shortcut).toBe(false);
    expect(space).toBe(false);
  });
});

describe('isMacPlatform', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'userAgentData');
  });

  it('prefers the client-hints platform where the browser has it', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'macOS' },
      configurable: true,
    });

    expect(isMacPlatform()).toBe(true);
  });

  it('falls back to navigator.platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Linux x86_64');

    expect(isMacPlatform()).toBe(false);
  });
});

describe('isPaletteKeyEvent', () => {
  const onMac = (event: KeyboardEvent) => isPaletteKeyEvent(event, true);
  const offMac = (event: KeyboardEvent) => isPaletteKeyEvent(event, false);

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('takes Cmd+K on macOS and Ctrl+K elsewhere', () => {
    expect(dispatch(onMac, 'k', { metaKey: true })).toBe(true);
    expect(dispatch(offMac, 'k', { ctrlKey: true })).toBe(true);
    expect(dispatch(onMac, 'k', { ctrlKey: true })).toBe(false);
    expect(dispatch(offMac, 'k', { metaKey: true })).toBe(false);
  });

  it('still opens while typing in a field', () => {
    expect(dispatch(onMac, 'k', { metaKey: true, on: appendWith('input') })).toBe(true);
  });

  it('ignores an auto-repeat', () => {
    expect(dispatch(onMac, 'k', { metaKey: true, repeat: true })).toBe(false);
  });

  it('stays shut while a modal dialog is open', () => {
    appendWith('div', { role: 'dialog', 'aria-modal': 'true' });

    expect(dispatch(onMac, 'k', { metaKey: true })).toBe(false);
  });

  it('leaves Shift combos alone', () => {
    expect(dispatch(onMac, 'k', { metaKey: true, shiftKey: true })).toBe(false);
  });

  it('leaves Alt combos and Ctrl with Cmd together alone', () => {
    expect(dispatch(onMac, 'k', { metaKey: true, altKey: true })).toBe(false);
    expect(dispatch(offMac, 'k', { ctrlKey: true, metaKey: true })).toBe(false);
  });

  it('takes a Caps Lock K', () => {
    expect(dispatch(offMac, 'K', { ctrlKey: true })).toBe(true);
  });

  it('ignores a bare k', () => {
    expect(dispatch(onMac, 'k')).toBe(false);
  });
});
