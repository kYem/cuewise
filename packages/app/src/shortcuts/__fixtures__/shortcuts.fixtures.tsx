import { type RenderResult, render } from '@testing-library/react';
import type React from 'react';
import { ShortcutProvider, useShortcutAction, useShortcutUi } from '../ShortcutProvider';
import type { ShortcutId } from '../shortcut-table';

export function renderWithShortcuts(ui: React.ReactElement): RenderResult {
  return render(<ShortcutProvider>{ui}</ShortcutProvider>);
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
