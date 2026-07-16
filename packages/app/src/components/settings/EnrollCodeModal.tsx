import { logger } from '@cuewise/shared';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useToastStore } from '../../stores/toast-store';
import type { EnableResult } from '../../sync/sync-controller';
import { AUTH_CANCELLED_DETAIL } from '../../sync/sync-controller';
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

/** null = quiet outcome: a deliberate re-auth cancel keeps the modal open with no error line. */
function messageFor(result: Extract<EnableResult, { ok: false }>): string | null {
  if (result.reason === 'auth' && result.detail === AUTH_CANCELLED_DETAIL) {
    return null;
  }
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
  // A google-source submit can run a minutes-long OAuth dance; the user may dismiss the modal
  // meanwhile. The ref lets the late resolution route its error to a toast instead of a
  // no-longer-rendered error line.
  const isOpenRef = useRef(isOpen);

  // Reset each time the modal opens, so a stale code/error from a prior attempt can't linger.
  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      setCode('');
      setErrorMessage(null);
    }
  }, [isOpen]);

  // Escape can unmount the whole settings tree without an isOpen=false render (SettingsModal
  // and Modal both handle it) — treat unmount as dismissed so a late failure still toasts.
  useEffect(() => {
    return () => {
      isOpenRef.current = false;
    };
  }, []);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await onSubmit(code);
      if (result.ok) {
        onClose();
        return;
      }
      const message = messageFor(result);
      if (message === null) {
        return;
      }
      if (isOpenRef.current) {
        setErrorMessage(message);
      } else {
        useToastStore.getState().error(message);
      }
    } catch (error) {
      logger.error('Enroll submit failed', error);
      if (isOpenRef.current) {
        setErrorMessage(GENERIC_FAILURE_MESSAGE);
      } else {
        useToastStore.getState().error(GENERIC_FAILURE_MESSAGE);
      }
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
          disabled={isSubmitting || code.trim() === ''}
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
