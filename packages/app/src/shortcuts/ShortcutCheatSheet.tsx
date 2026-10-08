import type React from 'react';
import { useId } from 'react';
import { Modal } from '../components/Modal';
import type { Shortcut, ShortcutGroup } from './shortcut-table';

const GROUPS: ShortcutGroup[] = ['Quote', 'Actions', 'Go to'];

export const KeyCaps: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className="flex items-center gap-1">
    {keys.map((key, index) => (
      <kbd
        key={`${key}-${index}`}
        className="min-w-6 px-1.5 py-0.5 rounded-md border border-border bg-surface-variant text-xs font-medium text-primary text-center"
      >
        {key}
      </kbd>
    ))}
  </span>
);

const ShortcutGroupList: React.FC<{ group: ShortcutGroup; rows: Shortcut[] }> = ({
  group,
  rows,
}) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-tertiary"
      >
        {group}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {rows.map((shortcut) => (
          <li key={shortcut.id} className="flex items-center justify-between text-sm text-primary">
            {shortcut.label}
            <KeyCaps keys={shortcut.keys} />
          </li>
        ))}
      </ul>
    </section>
  );
};

export const ShortcutCheatSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  shortcuts: Shortcut[];
  mac: boolean;
}> = ({ isOpen, onClose, shortcuts, mac }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts" size="md">
    <div className="flex flex-col gap-4">
      {GROUPS.map((group) => {
        const rows = shortcuts.filter((s) => s.group === group);
        if (rows.length === 0) {
          return null;
        }
        return <ShortcutGroupList key={group} group={group} rows={rows} />;
      })}
      <p className="text-xs text-secondary">
        Search commands <span className="font-medium text-primary">{mac ? '⌘ K' : 'Ctrl K'}</span> ·
        Esc closes
      </p>
    </div>
  </Modal>
);
