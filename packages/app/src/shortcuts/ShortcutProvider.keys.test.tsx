import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isShortcutKeyEvent, isSpaceShortcutEvent } from '../utils/keyboard-shortcut';
import {
  listenFor,
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

function press(key: string, init: KeyboardEventInit = {}, target: Element = document.body) {
  fireEvent.keyDown(target, { key, ...init });
}

describe('shortcut keys', () => {
  it('runs a live bare-key action', () => {
    const openSettings = vi.fn();
    renderWithShortcuts(<RegisterAction id="settings" run={openSettings} />);

    press('s');

    expect(openSettings).toHaveBeenCalledOnce();
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

  it('matches the key exactly, so a capital S runs nothing', () => {
    const openSettings = vi.fn();
    renderWithShortcuts(<RegisterAction id="settings" run={openSettings} />);

    press('S', { shiftKey: true });

    expect(openSettings).not.toHaveBeenCalled();
  });

  it('lets a key with no live action through untouched', () => {
    renderWithShortcuts(<RegisterAction id="goal.add" run={null} />);
    const event = new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true });

    document.body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
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

  it.each([
    ['Win32', { ctrlKey: true }],
    ['MacIntel', { metaKey: true }],
  ])('cancels the palette key on %s so the browser never sees it', (platform, modifier) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    renderWithShortcuts(<div />);

    const allowed = fireEvent.keyDown(document.body, { key: 'k', ...modifier });

    expect(allowed).toBe(false);
  });

  it('closes the palette on a second Ctrl+K and keeps it from the browser', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    renderWithShortcuts(<div />);
    press('k', { ctrlKey: true });

    const allowed = fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search commands' }), {
      key: 'k',
      ctrlKey: true,
    });

    expect(allowed).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('keeps Ctrl+K from the browser while another dialog is open', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    renderWithShortcuts(<div />);
    press('?', { shiftKey: true });

    const allowed = fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });

    expect(allowed).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('drops a pending g when the palette opens', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    renderWithShortcuts(<div />);

    press('g');
    press('k', { ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search commands' }), {
      key: 'Escape',
    });
    press('p');

    expect(window.location.hash).toBe('');
  });

  it('opens the palette with Cmd+K while typing, and gives focus back on close', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    renderWithShortcuts(<input aria-label="field" />);
    const field = screen.getByRole('textbox', { name: 'field' });
    field.focus();

    press('k', { metaKey: true }, field);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search commands' }), {
      key: 'Escape',
    });

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it('runs a palette command through the registry', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const openSettings = vi.fn();
    renderWithShortcuts(<RegisterAction id="settings" run={openSettings} />);

    press('k', { ctrlKey: true });
    const search = screen.getByRole('combobox', { name: 'Search commands' });
    fireEvent.change(search, { target: { value: 'settings' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('keeps Space from reaching the page while the palette is open', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const pageSpace = listenFor(isSpaceShortcutEvent);
    renderWithShortcuts(<div />);

    press('k', { ctrlKey: true });
    press(' ');

    expect(pageSpace).not.toHaveBeenCalled();
  });

  it('opens the cheat sheet on ?', () => {
    renderWithShortcuts(<div />);

    press('?', { shiftKey: true });

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});
