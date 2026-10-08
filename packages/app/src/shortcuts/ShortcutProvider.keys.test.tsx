import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isShortcutKeyEvent, isSpaceShortcutEvent } from '../utils/keyboard-shortcut';
import {
  listenFor,
  onPlatform,
  paletteSearch,
  press,
  RegisterAction,
  removeKeyListeners,
  renderWithShortcuts,
} from './__fixtures__/shortcuts.fixtures';
import { SEQUENCE_TIMEOUT_MS } from './ShortcutProvider';

beforeEach(() => {
  vi.useFakeTimers();
  window.location.hash = '';
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  removeKeyListeners();
});

describe('shortcut keys', () => {
  it('runs a live bare-key action', () => {
    const openSettings = vi.fn();
    renderWithShortcuts(<RegisterAction id="settings" run={openSettings} />);

    press('s');

    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('hides a key it ran from the page listeners', () => {
    const pageS = listenFor((e) => e.key === 's' && isShortcutKeyEvent(e));
    renderWithShortcuts(<RegisterAction id="settings" run={vi.fn()} />);

    press('s');

    expect(pageS).not.toHaveBeenCalled();
  });

  it('runs g sequences from a focused checkbox', () => {
    renderWithShortcuts(<input type="checkbox" aria-label="Select quote" />);
    const checkbox = screen.getByRole('checkbox', { name: 'Select quote' });
    checkbox.focus();

    press('g', {}, checkbox);
    press('p', {}, checkbox);

    expect(window.location.hash).toBe('#pomodoro');
  });

  it('ignores the key while typing in a field', () => {
    const openSettings = vi.fn();
    renderWithShortcuts(
      <>
        <RegisterAction id="settings" run={openSettings} />
        <input aria-label="field" />
      </>
    );

    press('s', {}, screen.getByRole('textbox', { name: 'field' }));

    expect(openSettings).not.toHaveBeenCalled();
  });

  it('runs a bare key with Caps Lock on', () => {
    const openSettings = vi.fn();
    renderWithShortcuts(<RegisterAction id="settings" run={openSettings} />);

    press('S', { modifierCapsLock: true });

    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('runs a g sequence with Caps Lock on', () => {
    renderWithShortcuts(<div />);

    press('G', { modifierCapsLock: true });
    press('P', { modifierCapsLock: true });

    expect(window.location.hash).toBe('#pomodoro');
  });

  it('leaves Shift+letter unbound with Caps Lock on', () => {
    const openSettings = vi.fn();
    renderWithShortcuts(<RegisterAction id="settings" run={openSettings} />);

    press('S', { shiftKey: true, modifierCapsLock: true });
    press('s', { shiftKey: true, modifierCapsLock: true });

    expect(openSettings).not.toHaveBeenCalled();
  });

  it('matches the key exactly, so a capital S runs nothing', () => {
    const openSettings = vi.fn();
    renderWithShortcuts(<RegisterAction id="settings" run={openSettings} />);

    press('S', { shiftKey: true });

    expect(openSettings).not.toHaveBeenCalled();
  });

  it('leaves Space and c to the page listeners that own them', () => {
    const space = listenFor(isSpaceShortcutEvent);
    const concept = listenFor((e) => e.key === 'c' && isShortcutKeyEvent(e));
    renderWithShortcuts(<div />);

    press(' ');
    press('c');

    expect(space).toHaveBeenCalledOnce();
    expect(concept).toHaveBeenCalledOnce();
  });

  it('stops listening once unmounted', () => {
    const concept = listenFor((e) => e.key === 'c' && isShortcutKeyEvent(e));
    const { unmount } = renderWithShortcuts(<div />);
    unmount();

    press('g');
    press('c');

    expect(concept).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('');
  });

  it('leaves a key with no live action to the page', () => {
    const pageN = listenFor((e) => e.key === 'n' && isShortcutKeyEvent(e));
    renderWithShortcuts(<RegisterAction id="goal.add" run={null} />);

    const allowed = press('n');

    expect(allowed).toBe(true);
    expect(pageN).toHaveBeenCalledOnce();
  });

  it('leaves Space and c to the components that own them', () => {
    const newQuote = vi.fn();
    const concept = vi.fn();
    renderWithShortcuts(
      <>
        <RegisterAction id="quote.next" run={newQuote} />
        <RegisterAction id="concept.show" run={concept} />
      </>
    );

    press(' ');
    press('c');

    expect(newQuote).not.toHaveBeenCalled();
    expect(concept).not.toHaveBeenCalled();
  });

  it.each([
    ['h', ''],
    ['p', '#pomodoro'],
    ['i', '#insights'],
    ['q', '#quotes'],
    ['g', '#goals'],
    ['c', '#concepts'],
  ])('g then %s navigates', (second, hash) => {
    window.location.hash = 'elsewhere';
    renderWithShortcuts(<div />);

    press('g');
    press(second);

    expect(window.location.hash).toBe(hash);
  });

  it('drops a pending g once the timeout passes', () => {
    renderWithShortcuts(<div />);

    press('g');
    act(() => {
      vi.advanceTimersByTime(SEQUENCE_TIMEOUT_MS + 1);
    });
    press('p');

    expect(window.location.hash).toBe('');
  });

  it('drops a pending g on Escape or any other key', () => {
    renderWithShortcuts(<div />);

    press('g');
    press('Escape');
    press('p');
    press('g');
    press('x');
    press('p');

    expect(window.location.hash).toBe('');
  });

  it('treats a held g as one press, not g then g', () => {
    renderWithShortcuts(<div />);

    press('g');
    press('g', { repeat: true });

    expect(window.location.hash).toBe('');
  });

  it('keeps the c in g c from reaching other c shortcuts', () => {
    const conceptKey = listenFor((e) => e.key === 'c' && isShortcutKeyEvent(e));
    renderWithShortcuts(<div />);

    press('g');
    press('c');

    expect(conceptKey).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#concepts');
  });

  it('ignores a g sequence typed into a field', () => {
    renderWithShortcuts(<input aria-label="field" />);
    const field = screen.getByRole('textbox', { name: 'field' });

    press('g', {}, field);
    press('p', {}, field);

    expect(window.location.hash).toBe('');
  });

  it('ignores a modified second key after g', () => {
    renderWithShortcuts(<div />);

    press('g');
    press('p', { ctrlKey: true });

    expect(window.location.hash).toBe('');
  });

  it('swallows a bare shortcut pressed while a g is pending', () => {
    const openSettings = vi.fn();
    renderWithShortcuts(<RegisterAction id="settings" run={openSettings} />);

    press('g');
    press('s');

    expect(openSettings).not.toHaveBeenCalled();
  });

  it('stands bare keys down while a dialog is open', () => {
    const openSettings = vi.fn();
    renderWithShortcuts(<RegisterAction id="settings" run={openSettings} />);

    press('?', { shiftKey: true });
    press('s');

    expect(openSettings).not.toHaveBeenCalled();
  });

  it('opens the cheat sheet on ?', () => {
    renderWithShortcuts(<div />);

    press('?', { shiftKey: true });

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('lists only live actions on the cheat sheet', () => {
    renderWithShortcuts(<RegisterAction id="settings" run={vi.fn()} />);

    press('?', { shiftKey: true });
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });

    expect(within(sheet).getByText('Settings')).toBeInTheDocument();
    expect(within(sheet).queryByText('Add a goal')).not.toBeInTheDocument();
  });
});

describe('command palette key', () => {
  it.each([
    ['Win32', { ctrlKey: true }],
    ['MacIntel', { metaKey: true }],
  ] as const)('cancels the palette key on %s so the browser never sees it', (platform, modifier) => {
    onPlatform(platform);
    renderWithShortcuts(<div />);

    expect(press('k', modifier)).toBe(false);
  });

  it('closes the palette on a second Ctrl+K and keeps it from the browser', () => {
    onPlatform('Win32');
    renderWithShortcuts(<div />);
    press('k', { ctrlKey: true });

    const allowed = press('k', { ctrlKey: true }, paletteSearch());

    expect(allowed).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('reopens the palette empty after a Ctrl+K closed it', () => {
    onPlatform('Win32');
    renderWithShortcuts(<div />);
    press('k', { ctrlKey: true });
    fireEvent.change(paletteSearch(), { target: { value: 'set' } });

    press('k', { ctrlKey: true }, paletteSearch());
    press('k', { ctrlKey: true });

    expect(paletteSearch()).toHaveValue('');
  });

  it('keeps a held Ctrl+K from the browser without toggling the palette', () => {
    onPlatform('Win32');
    renderWithShortcuts(<div />);
    press('k', { ctrlKey: true });

    const allowed = press('k', { ctrlKey: true, repeat: true }, paletteSearch());

    expect(allowed).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('takes Ctrl+K with Caps Lock on', () => {
    onPlatform('Win32');
    renderWithShortcuts(<div />);

    expect(press('K', { ctrlKey: true })).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('keeps Ctrl+K from the browser while another dialog is open', () => {
    onPlatform('Win32');
    renderWithShortcuts(<div />);
    press('?', { shiftKey: true });

    expect(press('k', { ctrlKey: true })).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('drops a pending g when the palette opens', () => {
    onPlatform('Win32');
    renderWithShortcuts(<div />);

    press('g');
    press('k', { ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Close command palette' }));
    press('p');

    expect(window.location.hash).toBe('');
  });

  it('opens the palette with Cmd+K while typing, and gives focus back on close', () => {
    onPlatform('MacIntel');
    renderWithShortcuts(<input aria-label="field" />);
    const field = screen.getByRole('textbox', { name: 'field' });
    field.focus();

    press('k', { metaKey: true }, field);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    press('Escape', {}, paletteSearch());

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it('runs a palette command through the registry', () => {
    onPlatform('Win32');
    const openSettings = vi.fn();
    renderWithShortcuts(<RegisterAction id="settings" run={openSettings} />);

    press('k', { ctrlKey: true });
    fireEvent.change(paletteSearch(), { target: { value: 'settings' } });
    press('Enter', {}, paletteSearch());

    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('swaps the palette for the cheat sheet when Keyboard shortcuts is chosen', () => {
    onPlatform('Win32');
    renderWithShortcuts(<div />);

    press('k', { ctrlKey: true });
    fireEvent.change(paletteSearch(), { target: { value: 'keyboard' } });
    press('Enter', {}, paletteSearch());

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('leaves focus to the dialog a palette command opens, not the field behind it', () => {
    onPlatform('Win32');
    renderWithShortcuts(<input aria-label="field" />);
    const field = screen.getByRole('textbox', { name: 'field' });
    field.focus();

    press('k', { ctrlKey: true }, field);
    fireEvent.change(paletteSearch(), { target: { value: 'keyboard' } });
    press('Enter', {}, paletteSearch());

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(field).not.toHaveFocus();
  });

  it('lists only live actions in the palette', () => {
    onPlatform('Win32');
    renderWithShortcuts(<div />);

    press('k', { ctrlKey: true });

    expect(screen.getByRole('option', { name: /Pomodoro/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Add a goal/ })).not.toBeInTheDocument();
  });

  it('keeps Space from reaching the page while the palette is open', () => {
    onPlatform('Win32');
    const pageSpace = listenFor(isSpaceShortcutEvent);
    renderWithShortcuts(<div />);

    press('k', { ctrlKey: true });
    press(' ');

    expect(pageSpace).not.toHaveBeenCalled();
  });
});
