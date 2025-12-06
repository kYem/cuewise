import { cn } from '@cuewise/ui';
import { ChevronDown, RotateCcw, Trash2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface QuoteRestorationMenuProps {
  missingSeedQuoteCount: number;
  onRestoreMissing: () => Promise<void>;
  onResetAll: () => void;
  isLoading?: boolean;
}

export const QuoteRestorationMenu: React.FC<QuoteRestorationMenuProps> = ({
  missingSeedQuoteCount,
  onRestoreMissing,
  onResetAll,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle outside click and escape key
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleRestoreMissing = async () => {
    await onRestoreMissing();
    setIsOpen(false);
  };

  const handleResetAll = () => {
    onResetAll();
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={cn(
          'flex items-center gap-2 px-4 py-3 bg-surface text-primary rounded-lg hover:bg-surface-variant transition-colors font-medium border border-border',
          isLoading && 'opacity-50 cursor-not-allowed'
        )}
      >
        <RotateCcw className="w-5 h-5" />
        More Options
        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 bg-surface-elevated rounded-lg shadow-xl border border-border z-20 overflow-hidden animate-fade-in"
        >
          {/* Restore Missing Quotes */}
          <button
            type="button"
            role="menuitem"
            aria-label={
              missingSeedQuoteCount > 0
                ? `Restore ${missingSeedQuoteCount} missing default quotes`
                : 'All default quotes are already present'
            }
            onClick={handleRestoreMissing}
            disabled={missingSeedQuoteCount === 0 || isLoading}
            className={cn(
              'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
              missingSeedQuoteCount > 0
                ? 'hover:bg-surface-variant text-primary'
                : 'text-tertiary cursor-not-allowed'
            )}
          >
            <RotateCcw className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Restore Missing Quotes</div>
              <div className="text-xs text-secondary mt-0.5">
                {missingSeedQuoteCount > 0
                  ? `Add back ${missingSeedQuoteCount} deleted default ${missingSeedQuoteCount === 1 ? 'quote' : 'quotes'}`
                  : 'All default quotes are present'}
              </div>
            </div>
          </button>

          <div className="h-px bg-border" />

          {/* Reset All Quotes */}
          <button
            type="button"
            role="menuitem"
            aria-label="Reset all quotes to factory defaults"
            onClick={handleResetAll}
            disabled={isLoading}
            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-red-50 text-red-600 transition-colors"
          >
            <Trash2 className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Reset All Quotes</div>
              <div className="text-xs text-red-500 mt-0.5">
                Delete all quotes and restore defaults
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
