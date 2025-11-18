import { CATEGORY_COLORS } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { ChevronLeft, ChevronRight, EyeOff, Heart, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { ErrorFallback } from './ErrorFallback';

interface QuoteDisplayProps {
  onManualRefresh?: () => void;
}

export const QuoteDisplay: React.FC<QuoteDisplayProps> = ({ onManualRefresh }) => {
  const quoteChangeInterval = useSettingsStore((state) => state.settings.quoteChangeInterval);
  const [timeRemaining, setTimeRemaining] = useState(quoteChangeInterval);
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
        <p className="text-xl text-secondary mb-4">No quotes available</p>
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
        <div className="absolute -top-6 -left-4 text-8xl font-serif text-primary-400">"</div>

        {/* Quote Text */}
        <blockquote className="relative z-10 h-[240px] flex flex-col justify-center">
          <p
            className={cn(
              getQuoteFontSize(currentQuote.text),
              'font-semibold text-primary leading-relaxed text-center mb-6 text-balance transition-all duration-300 drop-shadow-sm'
            )}
          >
            {currentQuote.text}
          </p>
          <footer className="text-center space-y-density-sm">
            <cite className="text-xl md:text-2xl font-semibold not-italic text-primary-600 dark:text-primary-500">
              — {currentQuote.author}
            </cite>

            {/* Source (for custom quotes) */}
            {currentQuote.source && (
              <div className="text-sm text-secondary italic">Source: {currentQuote.source}</div>
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
        <div className="absolute -bottom-6 -right-4 text-8xl font-serif text-primary-400">"</div>
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
              : 'bg-surface text-secondary hover:bg-surface-variant'
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
                ? 'bg-surface text-primary hover:bg-surface-variant hover:scale-110 hover:shadow-lg'
                : 'bg-surface-variant text-tertiary cursor-not-allowed'
            )}
            title="Previous quote"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleRefreshClick}
            className="relative flex items-center gap-density-xs px-density-lg py-density-sm bg-surface text-primary rounded-lg font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all overflow-hidden"
            title="New quote"
          >
            <RefreshCw className="w-5 h-5" />
            <span>New Quote</span>

            {/* Countdown Progress Bar - only show when auto-refresh is enabled */}
            {quoteChangeInterval > 0 && (
              <div
                className="absolute bottom-0 left-0 h-0.5 bg-primary-500 dark:bg-primary-400 transition-all duration-100 ease-linear"
                style={{ width: `${progressPercentage}%` }}
              />
            )}
          </button>

          <button
            type="button"
            onClick={handleGoForward}
            disabled={!canGoForward()}
            className={cn(
              'p-density-sm rounded-full transition-all',
              canGoForward()
                ? 'bg-surface text-primary hover:bg-surface-variant hover:scale-110 hover:shadow-lg'
                : 'bg-surface-variant text-tertiary cursor-not-allowed'
            )}
            title="Next quote"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => hideQuote(currentQuote.id)}
          className="p-density-sm rounded-full bg-surface text-secondary hover:bg-surface-variant hover:scale-110 transition-all hover:shadow-lg"
          title="Hide this quote"
        >
          <EyeOff className="w-5 h-5" />
        </button>
      </div>

      {/* View Count (subtle) */}
      {currentQuote.viewCount > 0 && (
        <div className="text-center mt-8 text-sm text-tertiary">
          Viewed {currentQuote.viewCount} {currentQuote.viewCount === 1 ? 'time' : 'times'}
        </div>
      )}
    </div>
  );
};
