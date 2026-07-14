import { logger } from '@cuewise/shared';
import { Copy, Download } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useToastStore } from '../../stores/toast-store';
import { Modal } from '../Modal';

export interface RecoveryCodeModalProps {
  isOpen: boolean;
  code: string;
  onSaved: () => void;
  onCancelUnsaved: () => void;
}

// 1-indexed into the code's dash-separated groups (CW1-xxxxx-xxxxx-...); fixed so the
// confirm gate always asks for the same segment for a given code.
const CONFIRM_GROUP_NUMBER = 3;

function normalizeSegment(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '').trim();
}

export const RecoveryCodeModal: React.FC<RecoveryCodeModalProps> = ({
  isOpen,
  code,
  onSaved,
  onCancelUnsaved,
}) => {
  const [confirmInput, setConfirmInput] = useState('');

  // Reset the gate each time the modal opens, so a stale value from a prior code can't match.
  useEffect(() => {
    if (isOpen) {
      setConfirmInput('');
    }
  }, [isOpen]);

  const groups = useMemo(() => code.split('-'), [code]);
  const confirmGroup = groups[CONFIRM_GROUP_NUMBER - 1] ?? '';
  const isMatch =
    confirmInput.trim().length > 0 &&
    normalizeSegment(confirmInput) === normalizeSegment(confirmGroup);

  const handleClose = () => {
    onCancelUnsaved();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      useToastStore.getState().success('Recovery code copied to clipboard');
    } catch (error) {
      // Log the failure only — never the code itself.
      logger.error('Failed to copy recovery code', error);
      useToastStore.getState().error('Failed to copy to clipboard');
    }
  };

  // A download throw in an onClick isn't caught by React error boundaries, so guard it here.
  // url/link are hoisted above the try so finally can always clean them up if a step throws.
  const handleDownload = () => {
    let url: string | undefined;
    let link: HTMLAnchorElement | undefined;
    try {
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8;' });
      url = URL.createObjectURL(blob);
      link = document.createElement('a');
      link.href = url;
      link.download = 'cuewise-recovery-code.txt';
      document.body.appendChild(link);
      link.click();
    } catch (error) {
      logger.error('Failed to download recovery code', error);
      useToastStore.getState().error('Failed to download recovery code');
    } finally {
      if (link?.isConnected) {
        document.body.removeChild(link);
      }
      if (url !== undefined) {
        URL.revokeObjectURL(url);
      }
    }
  };

  const handleDone = () => {
    if (!isMatch) {
      return;
    }
    onSaved();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Save your recovery code" size="md">
      <div className="space-y-4">
        <p className="text-sm text-secondary">
          This code is shown once and is never stored anywhere. Save it somewhere safe — it's the
          only way to recover your synced data if you lose access to this device.
        </p>

        <div
          className="flex flex-wrap justify-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-variant px-4 py-5 font-mono text-lg tracking-wide text-primary"
          data-testid="recovery-code-display"
        >
          {groups.map((group, index) => (
            <span key={`${index}-${group}`}>{group}</span>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-variant"
          >
            <Copy className="h-4 w-4" />
            Copy
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-variant"
          >
            <Download className="h-4 w-4" />
            Download .txt
          </button>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <label htmlFor="recovery-code-confirm" className="block text-sm font-medium text-primary">
            To confirm you saved it, retype group {CONFIRM_GROUP_NUMBER} below
          </label>
          <input
            id="recovery-code-confirm"
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={`Group ${CONFIRM_GROUP_NUMBER}`}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <button
          type="button"
          onClick={handleDone}
          disabled={!isMatch}
          className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Done
        </button>
      </div>
    </Modal>
  );
};
