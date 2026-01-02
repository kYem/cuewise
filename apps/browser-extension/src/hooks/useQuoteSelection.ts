import type { Quote } from '@cuewise/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface QuoteSelectionState {
  selectedQuoteIds: Set<string>;
  isSelectionMode: boolean;
  selectedQuotes: Quote[];
  hasSelectedFavorites: boolean;
  hasSelectedUnfavorited: boolean;
  hasSelectedHidden: boolean;
  hasSelectedVisible: boolean;
}

export interface QuoteSelectionActions {
  handleSelectQuote: (quoteId: string, selected: boolean) => void;
  handleDeselectAll: () => void;
  handleToggleSelectionMode: () => void;
  handleSelectAll: () => void;
  clearSelection: () => void;
}

export interface UseQuoteSelectionOptions {
  quotes: Quote[];
  filteredQuotes: Quote[];
}

export interface UseQuoteSelectionReturn extends QuoteSelectionState, QuoteSelectionActions {}

/**
 * Hook for managing quote selection state and actions.
 * Extracts common selection logic from QuoteManagementPage.
 */
export function useQuoteSelection({
  quotes,
  filteredQuotes,
}: UseQuoteSelectionOptions): UseQuoteSelectionReturn {
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Clear selection when filters change (detected by filteredQuotes length/content)
  useEffect(() => {
    setSelectedQuoteIds(new Set());
  }, [filteredQuotes]);

  // Get selected quotes for state calculations
  const selectedQuotes = useMemo(() => {
    return quotes.filter((q) => selectedQuoteIds.has(q.id));
  }, [quotes, selectedQuoteIds]);

  // Calculate selection state flags
  const hasSelectedFavorites = selectedQuotes.some((q) => q.isFavorite);
  const hasSelectedUnfavorited = selectedQuotes.some((q) => !q.isFavorite);
  const hasSelectedHidden = selectedQuotes.some((q) => q.isHidden);
  const hasSelectedVisible = selectedQuotes.some((q) => !q.isHidden);

  // Selection handlers
  const handleSelectQuote = useCallback((quoteId: string, selected: boolean) => {
    setSelectedQuoteIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(quoteId);
      } else {
        next.delete(quoteId);
      }
      return next;
    });
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedQuoteIds(new Set());
  }, []);

  const handleToggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => {
      // Clear selection when exiting selection mode
      if (prev) {
        setSelectedQuoteIds(new Set());
      }
      return !prev;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = new Set(filteredQuotes.map((q) => q.id));
    setSelectedQuoteIds(allIds);
  }, [filteredQuotes]);

  const clearSelection = useCallback(() => {
    setSelectedQuoteIds(new Set());
  }, []);

  return {
    // State
    selectedQuoteIds,
    isSelectionMode,
    selectedQuotes,
    hasSelectedFavorites,
    hasSelectedUnfavorited,
    hasSelectedHidden,
    hasSelectedVisible,
    // Actions
    handleSelectQuote,
    handleDeselectAll,
    handleToggleSelectionMode,
    handleSelectAll,
    clearSelection,
  };
}
