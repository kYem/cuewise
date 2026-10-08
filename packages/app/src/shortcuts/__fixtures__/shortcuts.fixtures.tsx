import { type RenderResult, render } from '@testing-library/react';
import type React from 'react';
import { type Mock, vi } from 'vitest';
import { ShortcutProvider, useShortcutAction, useShortcutUi } from '../ShortcutProvider';
import type { ShortcutId } from '../shortcut-table';

const keyListeners: Array<(event: KeyboardEvent) => void> = [];

/** A stand-in page listener: a spy called for each keydown the predicate accepts. */
export function listenFor(predicate: (event: KeyboardEvent) => boolean): Mock {
  const spy = vi.fn();
  const listener = (event: KeyboardEvent) => {
    if (predicate(event)) {
      spy();
    }
  };
  document.addEventListener('keydown', listener);
  keyListeners.push(listener);
  return spy;
}

export function removeKeyListeners(): void {
  for (const listener of keyListeners.splice(0)) {
    document.removeEventListener('keydown', listener);
  }
}

/** `rerender` keeps the provider, so a test re-renders with just its own tree. */
export function renderWithShortcuts(ui: React.ReactElement): RenderResult {
  const result = render(<ShortcutProvider>{ui}</ShortcutProvider>);
  return {
    ...result,
    rerender: (next: React.ReactNode) => {
      result.rerender(<ShortcutProvider>{next}</ShortcutProvider>);
    },
  };
}

export const RegisterAction: React.FC<{ id: ShortcutId; run: (() => void) | null }> = ({
  id,
  run,
}) => {
  useShortcutAction(id, run);
  return null;
};

/** The ids the cheat sheet and palette would list right now, space-separated. */
export const LiveIds: React.FC = () => {
  const ui = useShortcutUi();
  return <p data-testid="live">{ui?.liveShortcuts.map((s) => s.id).join(' ')}</p>;
};

export const RunButton: React.FC<{ id: ShortcutId }> = ({ id }) => {
  const ui = useShortcutUi();
  return <button type="button" aria-label={`run ${id}`} onClick={() => ui?.run(id)} />;
};
