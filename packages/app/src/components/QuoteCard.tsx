import { CATEGORY_COLORS, QUOTE_CATEGORIES, type Quote } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Check, Edit2, Eye, EyeOff, FolderPlus, Heart, Trash2 } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { CollectionPicker } from './CollectionPicker';

export interface QuoteCardProps {
  quote: Quote;
  onEdit: (quote: Quote) => void;
  onDelete: (quoteId: string) => void;
  onToggleFavorite: (quoteId: string) => void;
  onToggleHidden: (quoteId: string) => void;
  isSelected?: boolean;
  onSelectChange?: (quoteId: string, selected: boolean) => void;
  showCheckbox?: boolean;
}

export const QuoteCard: React.FC<QuoteCardProps> = ({
  quote,
  onEdit,
  onDelete,
  onToggleFavorite,
  onToggleHidden,
  isSelected = false,
  onSelectChange,
  showCheckbox = false,
}) => {
  const { collections } = useQuoteStore();
  const categoryColor = CATEGORY_COLORS[quote.category];
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const quoteCollectionCount = quote.collectionIds?.length ?? 0;

  const handleCheckboxChange = () => {
    onSelectChange?.(quote.id, !isSelected);
  };

  return (
    <div
      className={cn(
        'bg-surface rounded-xl shadow-md hover:shadow-lg transition-all p-6 border-2 relative',
        quote.isHidden && 'opacity-60',
        isSelected
          ? 'border-primary-500 ring-2 ring-primary-500/20'
          : 'border-transparent hover:border-border'
      )}
    >
      {/* Selection Checkbox */}
      {showCheckbox && (
        <label className="absolute top-3 left-3 z-10 cursor-pointer">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            className="sr-only"
            aria-label={`Select quote by ${quote.author}`}
          />
          <div
            className={cn(
              'w-6 h-6 rounded border-2 flex items-center justify-center transition-all',
              isSelected
                ? 'border-primary-600 bg-primary-600'
                : 'border-border bg-surface hover:border-primary-400'
            )}
          >
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </div>
        </label>
      )}

      {/* Category Badge */}
      <div className={cn('flex items-center justify-between mb-4', showCheckbox && 'ml-8')}>
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: categoryColor }}
        >
          {QUOTE_CATEGORIES[quote.category]}
        </span>

        {/* Custom Badge */}
        {quote.isCustom && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary-600/20 text-primary-600">
            Custom
          </span>
        )}
      </div>

      {/* Quote Text */}
      <blockquote className="mb-4">
        <p className="text-lg font-light text-primary leading-relaxed line-clamp-4">
          "{quote.text}"
        </p>
        <footer className="mt-2">
          <cite className="text-sm font-medium text-secondary not-italic">— {quote.author}</cite>
        </footer>
      </blockquote>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-secondary mb-4">
        <span>Views: {quote.viewCount}</span>
        {quote.lastViewed && <span>Last: {new Date(quote.lastViewed).toLocaleDateString()}</span>}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-divider">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleFavorite(quote.id)}
            className={cn(
              'p-2 rounded-full transition-all hover:scale-110',
              quote.isFavorite
                ? 'bg-red-500/20 text-red-600 hover:bg-red-500/30'
                : 'bg-surface-variant text-secondary hover:bg-border'
            )}
            title={quote.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={cn('w-4 h-4', quote.isFavorite && 'fill-current')} />
          </button>

          <button
            type="button"
            onClick={() => onToggleHidden(quote.id)}
            className={cn(
              'p-2 rounded-full transition-all hover:scale-110',
              quote.isHidden
                ? 'bg-primary-600/20 text-primary-600 hover:bg-primary-600/30'
                : 'bg-surface-variant text-secondary hover:bg-border'
            )}
            title={quote.isHidden ? 'Unhide quote' : 'Hide quote'}
          >
            {quote.isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {/* Collection Button */}
          {collections.length > 0 && (
            <CollectionPicker
              quote={quote}
              trigger={
                <button
                  type="button"
                  className={cn(
                    'p-2 rounded-full transition-all hover:scale-110 relative',
                    quoteCollectionCount > 0
                      ? 'bg-primary-600/20 text-primary-600 hover:bg-primary-600/30'
                      : 'bg-surface-variant text-secondary hover:bg-border'
                  )}
                  title={
                    quoteCollectionCount > 0
                      ? `In ${quoteCollectionCount} collection${quoteCollectionCount > 1 ? 's' : ''}`
                      : 'Add to collection'
                  }
                >
                  <FolderPlus className="w-4 h-4" />
                  {quoteCollectionCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-600 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                      {quoteCollectionCount}
                    </span>
                  )}
                </button>
              }
            />
          )}
        </div>

        {quote.isCustom && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(quote)}
              className="p-2 rounded-full bg-primary-600/20 text-primary-600 hover:bg-primary-600/30 transition-all hover:scale-110"
              title="Edit quote"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            {showDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onDelete(quote.id);
                    setShowDeleteConfirm(false);
                  }}
                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-2 py-1 text-xs bg-surface-variant text-primary rounded hover:bg-border"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-all hover:scale-110"
                title="Delete quote"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
