import type React from 'react';
import { useEffect, useState } from 'react';
import type { EnableResult } from '../../sync/sync-controller';
import { Modal } from '../Modal';

export interface EnrollCodeModalProps {
  isOpen: boolean;
  onSubmit: (code: string) => Promise<EnableResult>;
  onClose: () => void;
}

const BAD_CODE_MESSAGES: Record<string, string> = {
  format: "That doesn't look like a recovery code",
  checksum: "Code didn't check out — re-check for typos",
  version: 'Unsupported code version',
};

const GENERIC_BAD_CODE_MESSAGE = "That recovery code didn't work — please check it and try again";
const GENERIC_FAILURE_MESSAGE = "Couldn't enroll this device — please try again";

function messageFor(result: Extract<EnableResult, { ok: false }>): string {
  if (result.reason === 'bad-code') {
    if (result.detail !== undefined && result.detail in BAD_CODE_MESSAGES) {
      return BAD_CODE_MESSAGES[result.detail] as string;
    }
    return GENERIC_BAD_CODE_MESSAGE;
  }
  return GENERIC_FAILURE_MESSAGE;
}

export const EnrollCodeModal: React.FC<EnrollCodeModalProps> = ({ isOpen, onSubmit, onClose }) => {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset each time the modal opens, so a stale code/error from a prior attempt can't linger.
  useEffect(() => {
    if (isOpen) {
      setCode('');
      setErrorMessage(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await onSubmit(code);
      if (result.ok) {
        onClose();
        return;
      }
      setErrorMessage(messageFor(result));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enter recovery code" size="md">
      <div className="space-y-4">
        <p className="text-sm text-secondary">
          Enter the recovery code shown when you enabled sync on another device.
        </p>

        <div className="space-y-2">
          <label htmlFor="enroll-code-input" className="block text-sm font-medium text-primary">
            Recovery code
          </label>
          <input
            id="enroll-code-input"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
          />
        </div>

        {errorMessage && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <span
                data-testid="enroll-spinner"
                className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
              />
              Enrolling...
            </span>
          ) : (
            'Enroll'
          )}
        </button>
      </div>
    </Modal>
  );
};
