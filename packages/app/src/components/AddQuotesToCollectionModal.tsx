import type { Quote, QuoteCollection } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Check, Search, X } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';

interface AddQuotesToCollectionModalProps {
  collection: QuoteCollection;
  onClose: () => void;
}

export const AddQuotesToCollectionModal: React.FC<AddQuotesToCollectionModalProps> = ({
  collection,
  onClose,
}) => {
  const { quotes, addQuoteToCollection, removeQuoteFromCollection } = useQuoteStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter quotes based on search
  const filteredQuotes = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return quotes;
    }

    return quotes.filter(
      (quote) =>
        quote.text.toLowerCase().includes(query) || quote.author.toLowerCase().includes(query)
    );
  }, [quotes, searchQuery]);

  // Check if a quote is in the collection (considering pending changes)
  const isQuoteInCollection = (quote: Quote): boolean => {
    const currentlyIn = quote.collectionIds?.includes(collection.id) ?? false;
    if (pendingChanges[quote.id] !== undefined) {
      return pendingChanges[quote.id];
    }
    return currentlyIn;
  };

  // Toggle quote selection
  const toggleQuote = (quoteId: string) => {
    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote) {
      return;
    }

    const currentlyIn = quote.collectionIds?.includes(collection.id) ?? false;
    const pendingState = pendingChanges[quoteId];

    if (pendingState !== undefined) {
      // If there's a pending change, check if toggling would revert to original
      if (pendingState === currentlyIn) {
        // Remove from pending (no change needed)
        const newPending = { ...pendingChanges };
        delete newPending[quoteId];
        setPendingChanges(newPending);
      } else {
        // Toggle the pending state
        setPendingChanges({ ...pendingChanges, [quoteId]: !pendingState });
      }
    } else {
      // No pending change, create one
      setPendingChanges({ ...pendingChanges, [quoteId]: !currentlyIn });
    }
  };

  // Count changes
  const changeCount = Object.keys(pendingChanges).length;

  // Apply changes
  const handleApplyChanges = async () => {
    if (changeCount === 0) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      for (const [quoteId, shouldBeIn] of Object.entries(pendingChanges)) {
        if (shouldBeIn) {
          await addQuoteToCollection(quoteId, collection.id);
        } else {
          await removeQuoteFromCollection(quoteId, collection.id);
        }
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Count quotes currently in collection
  const quotesInCollection = quotes.filter((q) => q.collectionIds?.includes(collection.id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-primary">Add Quotes to Collection</h3>
            <p className="text-sm text-secondary mt-0.5">
              {collection.name} ({quotesInCollection} quotes)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-secondary hover:text-primary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search quotes by text or author..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-surface text-primary placeholder:text-tertiary focus:border-primary-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Quote List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {filteredQuotes.map((quote) => {
              const isSelected = isQuoteInCollection(quote);
              const hasChange = pendingChanges[quote.id] !== undefined;

              return (
                <button
                  key={quote.id}
                  type="button"
                  onClick={() => toggleQuote(quote.id)}
                  className={cn(
                    'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all',
                    isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700'
                      : 'bg-surface border-border hover:bg-surface-variant',
                    hasChange && 'ring-2 ring-primary-500/50'
                  )}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
                      isSelected ? 'bg-primary-600 border-primary-600' : 'border-border'
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-primary line-clamp-2">"{quote.text}"</p>
                    <p className="text-xs text-secondary mt-1">— {quote.author}</p>
                  </div>
                </button>
              );
            })}

            {filteredQuotes.length === 0 && (
              <div className="text-center py-8 text-secondary">
                No quotes found matching your search.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-surface-variant/50">
          <span className="text-sm text-secondary">
            {changeCount > 0 ? (
              <span className="text-primary-600 font-medium">{changeCount} changes pending</span>
            ) : (
              'Click quotes to add or remove'
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-secondary hover:text-primary transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyChanges}
              disabled={changeCount === 0 || isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? 'Saving...'
                : `Apply Changes${changeCount > 0 ? ` (${changeCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
