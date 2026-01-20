import { ALL_QUOTE_CATEGORIES, CATEGORY_COLORS, QUOTE_CATEGORIES } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Check, Filter, FolderOpen, Heart, Sparkles, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';

interface CategoryFilterProps {
  compact?: boolean;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({ compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    enabledCategories,
    setEnabledCategories,
    toggleCategory,
    showCustomQuotes,
    toggleCustomQuotes,
    showFavoritesOnly,
    toggleFavoritesOnly,
    collections,
    activeCollectionIds,
    toggleCollection,
    setActiveCollectionIds,
    quotes,
  } = useQuoteStore();

  // Count includes categories + custom (if enabled)
  const enabledCount = enabledCategories.length + (showCustomQuotes ? 1 : 0);
  const totalCount = ALL_QUOTE_CATEGORIES.length + 1; // +1 for Custom
  const allEnabled =
    enabledCategories.length === ALL_QUOTE_CATEGORIES.length &&
    showCustomQuotes &&
    !showFavoritesOnly &&
    activeCollectionIds.length === 0;

  // Get quote count for a collection
  const getCollectionQuoteCount = (collectionId: string) => {
    return quotes.filter((q) => !q.isHidden && q.collectionIds?.includes(collectionId)).length;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectAll = () => {
    setEnabledCategories([...ALL_QUOTE_CATEGORIES]);
    if (!showCustomQuotes) {
      toggleCustomQuotes();
    }
    if (showFavoritesOnly) {
      toggleFavoritesOnly();
    }
    if (activeCollectionIds.length > 0) {
      setActiveCollectionIds([]);
    }
  };

  const handleClearAll = () => {
    setEnabledCategories([]);
    if (showCustomQuotes) {
      toggleCustomQuotes();
    }
    if (showFavoritesOnly) {
      toggleFavoritesOnly();
    }
    if (activeCollectionIds.length > 0) {
      setActiveCollectionIds([]);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Filter Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'rounded-full transition-all',
          compact ? 'p-2 hover:scale-105' : 'p-density-sm hover:scale-110 hover:shadow-lg',
          isOpen || !allEnabled
            ? 'bg-primary-600 text-white'
            : compact
              ? 'bg-surface/60 text-secondary hover:bg-surface'
              : 'bg-surface text-secondary hover:bg-surface-variant'
        )}
        title={`Filter categories (${enabledCount}/${totalCount})`}
      >
        <Filter className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
      </button>

      {/* Badge showing filtered count */}
      {!allEnabled && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
          {enabledCount}
        </span>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 right-0 w-64 bg-surface/95 backdrop-blur-xl rounded-lg shadow-xl border border-border z-50 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-primary">Filter Quotes</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-surface-variant transition-colors"
            >
              <X className="w-4 h-4 text-secondary" />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 px-4 py-2 border-b border-border">
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={allEnabled}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                allEnabled
                  ? 'bg-surface-variant text-tertiary cursor-not-allowed'
                  : 'bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900 dark:text-primary-300 dark:hover:bg-primary-800'
              )}
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={enabledCategories.length === 0 && !showCustomQuotes}
              className={cn(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                enabledCategories.length === 0 && !showCustomQuotes
                  ? 'bg-surface-variant text-tertiary cursor-not-allowed'
                  : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800'
              )}
            >
              Clear All
            </button>
          </div>

          {/* Category List */}
          <div className="max-h-64 overflow-y-auto py-2">
            {/* Custom Quotes Option */}
            <button
              type="button"
              onClick={toggleCustomQuotes}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-variant transition-colors"
            >
              {/* Checkbox */}
              <div
                className={cn(
                  'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                  showCustomQuotes
                    ? 'border-primary-600 bg-primary-600'
                    : 'border-border bg-surface'
                )}
              >
                {showCustomQuotes && <Check className="w-3 h-3 text-white" />}
              </div>

              {/* Icon */}
              <Sparkles
                className={cn(
                  'w-3 h-3 flex-shrink-0',
                  showCustomQuotes ? 'text-amber-500' : 'text-secondary'
                )}
              />

              {/* Label */}
              <span className={cn('text-sm', showCustomQuotes ? 'text-primary' : 'text-secondary')}>
                Custom
              </span>
            </button>

            {/* Favorites Only Option */}
            <button
              type="button"
              onClick={toggleFavoritesOnly}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-variant transition-colors"
            >
              {/* Checkbox */}
              <div
                className={cn(
                  'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                  showFavoritesOnly
                    ? 'border-primary-600 bg-primary-600'
                    : 'border-border bg-surface'
                )}
              >
                {showFavoritesOnly && <Check className="w-3 h-3 text-white" />}
              </div>

              {/* Icon */}
              <Heart
                className={cn(
                  'w-3 h-3 flex-shrink-0',
                  showFavoritesOnly ? 'text-red-500 fill-current' : 'text-secondary'
                )}
              />

              {/* Label */}
              <span
                className={cn('text-sm', showFavoritesOnly ? 'text-primary' : 'text-secondary')}
              >
                Favorites Only
              </span>
            </button>

            {/* Collections Section */}
            {collections.length > 0 && (
              <>
                <div className="border-t border-border my-2" />
                <div className="px-4 py-1">
                  <span className="text-xs font-medium text-tertiary uppercase tracking-wide">
                    Collections
                  </span>
                </div>
                {collections.map((collection) => {
                  const isEnabled = activeCollectionIds.includes(collection.id);
                  const quoteCount = getCollectionQuoteCount(collection.id);

                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => toggleCollection(collection.id)}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-variant transition-colors"
                    >
                      <div
                        className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                          isEnabled
                            ? 'border-primary-600 bg-primary-600'
                            : 'border-border bg-surface'
                        )}
                      >
                        {isEnabled && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <FolderOpen
                        className={cn(
                          'w-3 h-3 flex-shrink-0',
                          isEnabled ? 'text-primary-600' : 'text-secondary'
                        )}
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <span
                          className={cn(
                            'text-sm block truncate',
                            isEnabled ? 'text-primary' : 'text-secondary'
                          )}
                        >
                          {collection.name}
                        </span>
                        <span className="text-xs text-tertiary">
                          {quoteCount} {quoteCount === 1 ? 'quote' : 'quotes'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {/* Divider */}
            <div className="border-t border-border my-2" />
            <div className="px-4 py-1">
              <span className="text-xs font-medium text-tertiary uppercase tracking-wide">
                Categories
              </span>
            </div>

            {/* Category Options */}
            {ALL_QUOTE_CATEGORIES.map((category) => {
              const isEnabled = enabledCategories.includes(category);
              const color = CATEGORY_COLORS[category];
              const displayName = QUOTE_CATEGORIES[category];

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-variant transition-colors"
                >
                  {/* Checkbox */}
                  <div
                    className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                      isEnabled ? 'border-primary-600 bg-primary-600' : 'border-border bg-surface'
                    )}
                  >
                    {isEnabled && <Check className="w-3 h-3 text-white" />}
                  </div>

                  {/* Color Dot */}
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />

                  {/* Category Name */}
                  <span className={cn('text-sm', isEnabled ? 'text-primary' : 'text-secondary')}>
                    {displayName}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          {enabledCount === 0 && (
            <div className="px-4 py-3 border-t border-border bg-orange-50 dark:bg-orange-900/20">
              <p className="text-xs text-orange-600 dark:text-orange-400 text-center">
                No categories selected. Select at least one to see quotes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
