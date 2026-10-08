import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShortcutCheatSheet } from './ShortcutCheatSheet';
import { SHORTCUTS } from './shortcut-table';

const WITHOUT_CONCEPT = SHORTCUTS.filter((s) => s.id !== 'concept.show');

describe('ShortcutCheatSheet', () => {
  it('groups the shortcuts it is given, each with its keys', () => {
    render(<ShortcutCheatSheet isOpen onClose={vi.fn()} shortcuts={WITHOUT_CONCEPT} mac />);

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const goTo = within(dialog).getByRole('region', { name: 'Go to' });
    expect(within(goTo).getByText('Pomodoro')).toBeInTheDocument();
    expect(within(dialog).queryByText('Show due concept')).not.toBeInTheDocument();
  });

  it('leaves out a group with nothing live in it', () => {
    const navigationOnly = SHORTCUTS.filter((s) => s.group === 'Go to');
    render(<ShortcutCheatSheet isOpen onClose={vi.fn()} shortcuts={navigationOnly} mac />);

    expect(screen.queryByRole('region', { name: 'Quote' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Go to' })).toBeInTheDocument();
  });

  it('names the palette key for macOS', () => {
    render(<ShortcutCheatSheet isOpen onClose={vi.fn()} shortcuts={[...SHORTCUTS]} mac />);

    expect(screen.getByText('⌘ K')).toBeInTheDocument();
  });

  it('names the palette key off macOS', () => {
    render(<ShortcutCheatSheet isOpen onClose={vi.fn()} shortcuts={[...SHORTCUTS]} mac={false} />);

    expect(screen.getByText('Ctrl K')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ShortcutCheatSheet isOpen onClose={onClose} shortcuts={[...SHORTCUTS]} mac />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
