import { X } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Use portal to render modal at document body level
  // This prevents issues with parent transforms/filters breaking fixed positioning
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
        aria-label="Close modal"
        tabIndex={-1}
      />

      {/* Modal Content */}
      <div className="relative bg-surface-elevated rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-slide-up">
        {/* Header - only show if title is provided */}
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-2xl font-semibold text-primary">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-surface-variant rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-secondary" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className={`overflow-y-auto max-h-[calc(90vh-140px)] ${title ? 'p-6' : ''}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
