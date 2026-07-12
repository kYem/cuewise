import { Star } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';

interface ReviewPromptModalProps {
  isOpen: boolean;
  /** "Leave a review" — open the store and stop asking */
  onReview: () => void;
  /** "Maybe later" / backdrop / Escape — dismiss this showing, may ask once more */
  onLater: () => void;
  /** "Don't ask again" — stop asking permanently */
  onDismiss: () => void;
}

/**
 * Gentle store-review nudge shown at a moment of delight. Presentational only —
 * the parent owns the settings writes and the show-count.
 */
export const ReviewPromptModal: React.FC<ReviewPromptModalProps> = ({
  isOpen,
  onReview,
  onLater,
  onDismiss,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onLater();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onLater]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
        onClick={onLater}
        aria-label="Dismiss review prompt"
        tabIndex={-1}
      />

      <div
        className="relative bg-surface-elevated rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-prompt-title"
      >
        <div className="px-6 pt-6 pb-2 text-center">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 flex items-center justify-center rounded-full bg-primary-500/20">
              <Star
                className="w-7 h-7 text-primary-600 dark:text-primary-400"
                fill="currentColor"
              />
            </div>
          </div>
          <h2 id="review-prompt-title" className="text-xl font-bold text-primary">
            Enjoying Cuewise?
          </h2>
          <p className="mt-2 text-sm text-secondary">
            A quick review helps others find a calmer new tab — it only takes a few seconds.
          </p>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-2">
          <button
            type="button"
            onClick={onReview}
            className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Leave a review
          </button>
          <button
            type="button"
            onClick={onLater}
            className="w-full py-2.5 px-4 text-secondary hover:text-primary font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            Maybe later
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-1 text-xs text-tertiary hover:text-secondary transition-colors focus:outline-none"
          >
            Don't ask again
          </button>
        </div>
      </div>
    </div>
  );
};
