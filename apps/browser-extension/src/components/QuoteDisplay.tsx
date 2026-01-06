import { ALL_QUOTE_CATEGORIES, CATEGORY_COLORS } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { ChevronLeft, ChevronRight, EyeOff, Filter, Heart, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { AuthorTicker } from './AuthorTicker';
import { CategoryFilter } from './CategoryFilter';
import { CategoryTicker } from './CategoryTicker';
import { ErrorFallback } from './ErrorFallback';

interface QuoteDisplayProps {
  onManualRefresh?: () => void;
  variant?: 'normal' | 'compact';
  position?: 'top' | 'bottom';
}

export const QuoteDisplay: React.FC<QuoteDisplayProps> = ({
  onManualRefresh,
  variant = 'normal',
  position = 'top',
}) => {
  const { quoteChangeInterval, enableQuoteAnimation } = useSettingsStore(
    useShallow((state) => ({
      quoteChangeInterval: state.settings.quoteChangeInterval,
      enableQuoteAnimation: state.settings.enableQuoteAnimation,
    }))
  );
  const [timeRemaining, setTimeRemaining] = useState(quoteChangeInterval);

  // State values - use useShallow to prevent re-renders when unrelated state changes
  const { currentQuote, isLoading, error, enabledCategories, showCustomQuotes } = useQuoteStore(
    useShallow((state) => ({
      currentQuote: state.currentQuote,
      isLoading: state.isLoading,
      error: state.error,
      enabledCategories: state.enabledCategories,
      showCustomQuotes: state.showCustomQuotes,
    }))
  );

  // Actions - stable references that don't cause re-renders
  const refreshQuote = useQuoteStore((state) => state.refreshQuote);
  const goBack = useQuoteStore((state) => state.goBack);
  const goForward = useQuoteStore((state) => state.goForward);
  const canGoBack = useQuoteStore((state) => state.canGoBack);
  const canGoForward = useQuoteStore((state) => state.canGoForward);
  const toggleFavorite = useQuoteStore((state) => state.toggleFavorite);
  const hideQuote = useQuoteStore((state) => state.hideQuote);
  const initialize = useQuoteStore((state) => state.initialize);
  const setEnabledCategories = useQuoteStore((state) => state.setEnabledCategories);
  const toggleCustomQuotes = useQuoteStore((state) => state.toggleCustomQuotes);

  const isFiltered = enabledCategories.length < ALL_QUOTE_CATEGORIES.length || !showCustomQuotes;

  // Countdown timer for auto-refresh
  useEffect(() => {
    // Reset countdown when interval changes or when quote changes
    setTimeRemaining(quoteChangeInterval);
  }, [quoteChangeInterval, currentQuote?.id]);

  // Update countdown every 100ms for smooth animation
  useEffect(() => {
    if (quoteChangeInterval === 0 || !currentQuote) {
      return; // No countdown if manual mode or no quote
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0.1) {
          return quoteChangeInterval; // Reset when countdown finishes
        }
        return prev - 0.1; // Decrease by 100ms
      });
    }, 100);

    return () => clearInterval(interval);
  }, [quoteChangeInterval, currentQuote]);

  const handleRefreshClick = async () => {
    await refreshQuote();
    setTimeRemaining(quoteChangeInterval); // Reset countdown on manual refresh
    onManualRefresh?.();
  };

  const handleGoBack = async () => {
    await goBack();
    setTimeRemaining(quoteChangeInterval); // Reset countdown on navigation
    onManualRefresh?.();
  };

  const handleGoForward = async () => {
    await goForward();
    setTimeRemaining(quoteChangeInterval); // Reset countdown on navigation
    onManualRefresh?.();
  };

  // Calculate progress percentage (100% = full time, 0% = no time left)
  const progressPercentage =
    quoteChangeInterval > 0 ? (timeRemaining / quoteChangeInterval) * 100 : 0;

  // Calculate dynamic font size based on quote length to prevent layout shifts
  const getQuoteFontSize = (text: string): string => {
    const length = text.length;

    // Compact variant: ~50% smaller fonts
    if (variant === 'compact') {
      if (length < 50) {
        return 'text-lg md:text-xl lg:text-2xl';
      }
      if (length < 80) {
        return 'text-base md:text-lg lg:text-xl';
      }
      if (length < 120) {
        return 'text-sm md:text-base lg:text-lg';
      }
      if (length < 180) {
        return 'text-sm md:text-sm lg:text-base';
      }
      return 'text-xs md:text-sm lg:text-sm';
    }

    // Normal variant
    if (length < 50) {
      return 'text-3xl md:text-4xl lg:text-5xl'; // Very short quotes - largest
    }
    if (length < 80) {
      return 'text-2xl md:text-3xl lg:text-4xl'; // Short quotes - large
    }
    if (length < 120) {
      return 'text-xl md:text-2xl lg:text-3xl'; // Medium quotes - medium
    }
    if (length < 180) {
      return 'text-lg md:text-xl lg:text-2xl'; // Long quotes - smaller
    }
    return 'text-base md:text-lg lg:text-xl'; // Very long quotes - smallest
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return <ErrorFallback error={error} title="Failed to load quotes" onRetry={initialize} />;
  }

  if (!currentQuote) {
    // Check if it's due to category filtering (any filter applied)
    const noMatchingQuotes = (enabledCategories.length === 0 && !showCustomQuotes) || isFiltered;

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        {noMatchingQuotes ? (
          <>
            <Filter className="w-12 h-12 text-secondary mb-4" />
            <p className="text-xl text-secondary mb-2">No quotes match your selected categories</p>
            <p className="text-sm text-tertiary mb-6">
              {enabledCategories.length === 0 && !showCustomQuotes
                ? 'Select at least one category to see quotes.'
                : 'Try selecting more categories to see more quotes.'}
            </p>
            <button
              type="button"
              onClick={async () => {
                setEnabledCategories([...ALL_QUOTE_CATEGORIES]);
                if (!showCustomQuotes) {
                  toggleCustomQuotes();
                }
                // Refresh to get a new quote with the restored filters
                await refreshQuote();
              }}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Show All Categories
            </button>
          </>
        ) : (
          <>
            <p className="text-xl text-secondary mb-4">No quotes available</p>
            <button
              type="button"
              onClick={handleRefreshClick}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    );
  }

  const categoryColor = CATEGORY_COLORS[currentQuote.category];

  const isBottom = position === 'bottom';

  return (
    <div className="w-full max-w-4xl mx-auto animate-fade-in">
      {/* Category Badge - Only show at top position */}
      {!isBottom && (
        <div className="flex justify-center mb-6">
          <span
            className="inline-flex items-center px-density-md py-density-xs rounded-full text-sm font-medium text-white shadow-sm"
            style={{ backgroundColor: categoryColor }}
          >
            {enableQuoteAnimation ? (
              <CategoryTicker category={currentQuote.category} />
            ) : (
              currentQuote.category.charAt(0).toUpperCase() + currentQuote.category.slice(1)
            )}
          </span>
        </div>
      )}

      {/* Quote Card - aria-live announces quote changes to screen readers */}
      <div className="relative" aria-live="polite" aria-atomic="true">
        {/* Quote Text */}
        <blockquote
          className={cn(
            'relative z-10 flex flex-col justify-center',
            isBottom ? 'min-h-0' : 'h-[240px]'
          )}
        >
          <p
            className={cn(
              getQuoteFontSize(currentQuote.text),
              'font-semibold text-primary leading-relaxed text-center text-balance transition-all duration-300 drop-shadow-sm',
              isBottom ? 'mb-2' : 'mb-6'
            )}
          >
            {currentQuote.text}
          </p>
          <footer className={cn('text-center', isBottom ? 'space-y-1' : 'space-y-density-sm')}>
            {/* Author with inline category for bottom position */}
            <div
              className={cn(
                'flex items-center justify-center gap-2',
                isBottom ? 'flex-wrap' : 'flex-col'
              )}
            >
              <cite
                className={cn(
                  'font-semibold not-italic text-primary-600 dark:text-primary-500',
                  isBottom ? 'text-base md:text-lg' : 'text-xl md:text-2xl'
                )}
              >
                {enableQuoteAnimation ? (
                  <AuthorTicker author={currentQuote.author} />
                ) : (
                  `— ${currentQuote.author}`
                )}
              </cite>

              {/* Inline category badge for bottom position */}
              {isBottom && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: categoryColor }}
                >
                  {enableQuoteAnimation ? (
                    <CategoryTicker category={currentQuote.category} />
                  ) : (
                    currentQuote.category.charAt(0).toUpperCase() + currentQuote.category.slice(1)
                  )}
                </span>
              )}
            </div>

            {/* Source (for custom quotes) - hide in bottom mode */}
            {!isBottom && currentQuote.source && (
              <div className="text-sm text-secondary italic">Source: {currentQuote.source}</div>
            )}

            {/* Personal Notes (for custom quotes) - hide in bottom mode */}
            {!isBottom && currentQuote.notes && (
              <div className="text-sm text-primary bg-orange-500/10 border border-orange-500/30 rounded-lg px-density-md py-density-sm inline-block">
                💭 {currentQuote.notes}
              </div>
            )}
          </footer>
        </blockquote>
      </div>

      {/* Action Buttons - Compact row */}
      <div className={cn('flex items-center justify-center gap-2', isBottom ? 'mt-2' : 'mt-4')}>
        {/* Navigation: Back */}
        <button
          type="button"
          onClick={handleGoBack}
          disabled={!canGoBack()}
          className={cn(
            'p-2 rounded-full transition-all',
            canGoBack()
              ? 'bg-surface/60 text-primary hover:bg-surface hover:scale-105'
              : 'bg-surface/30 text-tertiary cursor-not-allowed'
          )}
          title="Previous quote"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* New Quote (center, slightly larger) */}
        <button
          type="button"
          onClick={handleRefreshClick}
          className="relative p-2.5 bg-surface/60 text-primary rounded-full hover:bg-surface hover:scale-105 transition-all overflow-hidden"
          title="New quote"
        >
          <RefreshCw className="w-5 h-5" />
          {/* Countdown Progress Ring */}
          {quoteChangeInterval > 0 && (
            <svg
              className="absolute inset-0 w-full h-full -rotate-90"
              viewBox="0 0 36 36"
              role="img"
              aria-label="Quote refresh countdown"
            >
              <circle
                className="text-primary-500/30"
                strokeWidth="2"
                stroke="currentColor"
                fill="transparent"
                r="16"
                cx="18"
                cy="18"
              />
              <circle
                className="text-primary-500"
                strokeWidth="2"
                strokeDasharray={`${progressPercentage} 100`}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="16"
                cx="18"
                cy="18"
              />
            </svg>
          )}
        </button>

        {/* Navigation: Forward */}
        <button
          type="button"
          onClick={handleGoForward}
          disabled={!canGoForward()}
          className={cn(
            'p-2 rounded-full transition-all',
            canGoForward()
              ? 'bg-surface/60 text-primary hover:bg-surface hover:scale-105'
              : 'bg-surface/30 text-tertiary cursor-not-allowed'
          )}
          title="Next quote"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Separator */}
        <div className="w-px h-4 bg-border/50 mx-1" />

        {/* Favorite */}
        <button
          type="button"
          onClick={() => toggleFavorite(currentQuote.id)}
          className={cn(
            'p-2 rounded-full transition-all hover:scale-105',
            currentQuote.isFavorite
              ? 'bg-red-500 text-white'
              : 'bg-surface/60 text-secondary hover:bg-surface'
          )}
          title={currentQuote.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart className={cn('w-4 h-4', currentQuote.isFavorite && 'fill-current')} />
        </button>

        {/* Category Filter */}
        <CategoryFilter compact />

        {/* Hide */}
        <button
          type="button"
          onClick={() => hideQuote(currentQuote.id)}
          className="p-2 rounded-full bg-surface/60 text-secondary hover:bg-surface hover:scale-105 transition-all"
          title="Hide this quote"
        >
          <EyeOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
