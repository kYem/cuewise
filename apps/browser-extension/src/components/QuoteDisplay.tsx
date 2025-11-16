import { CATEGORY_COLORS } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { ChevronLeft, ChevronRight, EyeOff, Heart, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { ErrorFallback } from './ErrorFallback';

interface QuoteDisplayProps {
  onManualRefresh?: () => void;
}

export const QuoteDisplay: React.FC<QuoteDisplayProps> = ({ onManualRefresh }) => {
  const {
    currentQuote,
    refreshQuote,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    toggleFavorite,
    hideQuote,
    isLoading,
    error,
    initialize,
  } = useQuoteStore();

  const handleRefreshClick = async () => {
    await refreshQuote();
    onManualRefresh?.();
  };

  const handleGoBack = async () => {
    await goBack();
    onManualRefresh?.();
  };

  const handleGoForward = async () => {
    await goForward();
    onManualRefresh?.();
  };

  // Calculate dynamic font size based on quote length to prevent layout shifts
  const getQuoteFontSize = (text: string): string => {
    const length = text.length;
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
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <p className="text-xl text-gray-500 mb-4">No quotes available</p>
        <button
          type="button"
          onClick={handleRefreshClick}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const categoryColor = CATEGORY_COLORS[currentQuote.category];

  return (
    <div className="w-full max-w-4xl mx-auto animate-fade-in">
      {/* Category Badge */}
      <div className="flex justify-center mb-6">
        <span
          className="inline-flex items-center px-density-md py-density-xs rounded-full text-sm font-medium text-white shadow-sm"
          style={{ backgroundColor: categoryColor }}
        >
          {currentQuote.category.charAt(0).toUpperCase() + currentQuote.category.slice(1)}
        </span>
      </div>

      {/* Quote Card */}
      <div className="relative">
        {/* Decorative Quote Marks */}
        <div
          className="absolute -top-6 -left-4 text-8xl font-serif opacity-10"
          style={{ color: categoryColor }}
        >
          "
        </div>

        {/* Quote Text */}
        <blockquote className="relative z-10 h-[240px] flex flex-col justify-center">
          <p
            className={cn(
              getQuoteFontSize(currentQuote.text),
              'font-light text-gray-800 dark:text-gray-100 leading-relaxed text-center mb-6 text-balance transition-all duration-300'
            )}
          >
            {currentQuote.text}
          </p>
          <footer className="text-center space-y-density-sm">
            <cite
              className="text-xl md:text-2xl font-medium not-italic"
              style={{ color: categoryColor }}
            >
              — {currentQuote.author}
            </cite>

            {/* Source (for custom quotes) */}
            {currentQuote.source && (
              <div className="text-sm text-gray-500 dark:text-gray-400 italic">Source: {currentQuote.source}</div>
            )}

            {/* Personal Notes (for custom quotes) */}
            {currentQuote.notes && (
              <div className="text-sm text-gray-600 dark:text-gray-300 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg px-density-md py-density-sm inline-block">
                💭 {currentQuote.notes}
              </div>
            )}
          </footer>
        </blockquote>

        {/* Decorative Quote Marks */}
        <div
          className="absolute -bottom-6 -right-4 text-8xl font-serif opacity-10"
          style={{ color: categoryColor }}
        >
          "
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-density-md mt-12">
        <button
          type="button"
          onClick={() => toggleFavorite(currentQuote.id)}
          className={cn(
            'p-density-sm rounded-full transition-all hover:scale-110 hover:shadow-lg',
            currentQuote.isFavorite
              ? 'bg-red-500 text-white'
              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
          )}
          title={currentQuote.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart className={cn('w-5 h-5', currentQuote.isFavorite && 'fill-current')} />
        </button>

        {/* Navigation Buttons */}
        <div className="flex items-center gap-density-xs">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={!canGoBack()}
            className={cn(
              'p-density-sm rounded-full transition-all',
              canGoBack()
                ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 hover:scale-110 hover:shadow-lg'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'
            )}
            title="Previous quote"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleRefreshClick}
            className="flex items-center gap-density-xs px-density-lg py-density-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all"
            title="New quote"
          >
            <RefreshCw className="w-5 h-5" />
            <span>New Quote</span>
          </button>

          <button
            type="button"
            onClick={handleGoForward}
            disabled={!canGoForward()}
            className={cn(
              'p-density-sm rounded-full transition-all',
              canGoForward()
                ? 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 hover:scale-110 hover:shadow-lg'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'
            )}
            title="Next quote"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => hideQuote(currentQuote.id)}
          className="p-density-sm rounded-full bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 hover:scale-110 transition-all hover:shadow-lg"
          title="Hide this quote"
        >
          <EyeOff className="w-5 h-5" />
        </button>
      </div>

      {/* View Count (subtle) */}
      {currentQuote.viewCount > 0 && (
        <div className="text-center mt-8 text-sm text-gray-400 dark:text-gray-500">
          Viewed {currentQuote.viewCount} {currentQuote.viewCount === 1 ? 'time' : 'times'}
        </div>
      )}
    </div>
  );
};
