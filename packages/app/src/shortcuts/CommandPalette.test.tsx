import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette, filterShortcuts } from './CommandPalette';
import { SHORTCUTS } from './shortcut-table';

const ALL = [...SHORTCUTS];

function renderPalette() {
  const onRun = vi.fn();
  const onClose = vi.fn();
  render(<CommandPalette isOpen onClose={onClose} shortcuts={ALL} onRun={onRun} />);
  return { onRun, onClose, input: screen.getByRole('combobox', { name: 'Search commands' }) };
}

describe('filterShortcuts', () => {
  it('puts label matches before keyword matches', () => {
    expect(filterShortcuts(ALL, 'focus').map((s) => s.id)).toEqual(['focus', 'go.pomodoro']);
  });

  it('finds a command by keyword alone', () => {
    expect(filterShortcuts(ALL, 'prefs').map((s) => s.id)).toEqual(['settings']);
  });

  it('lists everything for a blank query', () => {
    expect(filterShortcuts(ALL, '  ')).toHaveLength(ALL.length);
  });
});

describe('CommandPalette', () => {
  it('focuses the search when it opens', () => {
    const { input } = renderPalette();

    expect(input).toHaveFocus();
  });

  it('runs the top match on Enter and closes', () => {
    const { onRun, onClose, input } = renderPalette();

    fireEvent.change(input, { target: { value: 'prefs' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onClose).toHaveBeenCalled();
    expect(onRun).toHaveBeenCalledWith('settings');
  });

  it('moves the selection with the arrow keys', () => {
    const { onRun, input } = renderPalette();

    fireEvent.change(input, { target: { value: 'focus' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.getByRole('option', { name: /Pomodoro/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRun).toHaveBeenCalledWith('go.pomodoro');
  });

  it('wraps from the top to the bottom', () => {
    const { input } = renderPalette();

    fireEvent.change(input, { target: { value: 'focus' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(screen.getByRole('option', { name: /Pomodoro/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('runs a command when clicked', () => {
    const { onRun } = renderPalette();

    fireEvent.click(screen.getByRole('option', { name: /Insights/ }));

    expect(onRun).toHaveBeenCalledWith('go.insights');
  });

  it('says so when nothing matches', () => {
    const { input } = renderPalette();

    fireEvent.change(input, { target: { value: 'zzz' } });

    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });

  it('keeps Tab inside the palette', () => {
    const { input } = renderPalette();

    const allowed = fireEvent.keyDown(input, { key: 'Tab' });

    expect(allowed).toBe(false);
  });

  it('closes on Escape wherever focus sits inside it', () => {
    const { onClose } = renderPalette();

    fireEvent.keyDown(screen.getByRole('option', { name: /Insights/ }), { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onClose, input } = renderPalette();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
