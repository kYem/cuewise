import { CATEGORY_COLORS } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { EyeOff, Heart, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useQuoteStore } from '../stores/quote-store';

export const QuoteDisplay: React.FC = () => {
  const { currentQuote, refreshQuote, toggleFavorite, hideQuote, isLoading } = useQuoteStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!currentQuote) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <p className="text-xl text-gray-500 mb-4">No quotes available</p>
        <button
          onClick={refreshQuote}
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
          className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium text-white shadow-sm"
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
        <blockquote className="relative z-10">
          <p className="text-3xl md:text-4xl lg:text-5xl font-light text-gray-800 leading-relaxed text-center mb-8 text-balance">
            {currentQuote.text}
          </p>
          <footer className="text-center space-y-3">
            <cite
              className="text-xl md:text-2xl font-medium not-italic"
              style={{ color: categoryColor }}
            >
              — {currentQuote.author}
            </cite>

            {/* Source (for custom quotes) */}
            {currentQuote.source && (
              <div className="text-sm text-gray-500 italic">
                Source: {currentQuote.source}
              </div>
            )}

            {/* Personal Notes (for custom quotes) */}
            {currentQuote.notes && (
              <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 inline-block">
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
      <div className="flex items-center justify-center gap-4 mt-12">
        <button
          onClick={() => toggleFavorite(currentQuote.id)}
          className={cn(
            'p-3 rounded-full transition-all hover:scale-110 hover:shadow-lg',
            currentQuote.isFavorite
              ? 'bg-red-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          )}
          title={currentQuote.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart className={cn('w-5 h-5', currentQuote.isFavorite && 'fill-current')} />
        </button>

        <button
          onClick={refreshQuote}
          className="flex items-center gap-2 px-6 py-3 bg-white text-gray-700 rounded-full font-medium shadow-md hover:shadow-lg hover:scale-105 transition-all"
          title="New quote"
        >
          <RefreshCw className="w-5 h-5" />
          <span>New Quote</span>
        </button>

        <button
          onClick={() => hideQuote(currentQuote.id)}
          className="p-3 rounded-full bg-white text-gray-600 hover:bg-gray-50 hover:scale-110 transition-all hover:shadow-lg"
          title="Hide this quote"
        >
          <EyeOff className="w-5 h-5" />
        </button>
      </div>

      {/* View Count (subtle) */}
      {currentQuote.viewCount > 0 && (
        <div className="text-center mt-8 text-sm text-gray-400">
          Viewed {currentQuote.viewCount} {currentQuote.viewCount === 1 ? 'time' : 'times'}
        </div>
      )}
    </div>
  );
};
