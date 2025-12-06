import { cn } from '@cuewise/ui';
import { AlertTriangle } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';

export type ConfirmationVariant = 'danger' | 'warning' | 'primary';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmationVariant;
  isLoading?: boolean;
}

const variantStyles: Record<ConfirmationVariant, { button: string; icon: string }> = {
  danger: {
    button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    icon: 'text-red-600',
  },
  warning: {
    button: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    icon: 'text-yellow-600',
  },
  primary: {
    button: 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500',
    icon: 'text-primary-600',
  },
};

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Handle keyboard events and focus management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      // Focus the cancel button for safety (not the confirm button)
      setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 0);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, isLoading]);

  if (!isOpen) {
    return null;
  }

  const styles = variantStyles[variant];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-message"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={isLoading ? undefined : onClose}
        aria-label="Close dialog"
        tabIndex={-1}
        disabled={isLoading}
      />

      {/* Dialog Content */}
      <div className="relative bg-surface-elevated rounded-xl shadow-2xl max-w-md w-full animate-slide-up">
        <div className="p-6">
          {/* Icon and Title */}
          <div className="flex items-start gap-4">
            <div className={cn('p-2 rounded-full bg-surface-variant', styles.icon)}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 id="confirmation-title" className="text-lg font-semibold text-primary">
                {title}
              </h3>
              <p id="confirmation-message" className="mt-2 text-secondary">
                {message}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-secondary bg-surface hover:bg-surface-variant rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={cn(
                'px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50',
                styles.button
              )}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
