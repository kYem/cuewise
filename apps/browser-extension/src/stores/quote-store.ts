import {
  ALL_QUOTE_CATEGORIES,
  getRandomQuote,
  logger,
  type Quote,
  type QuoteCategory,
} from '@cuewise/shared';
import { getCurrentQuote, getQuotes, setCurrentQuote, setQuotes } from '@cuewise/storage';
import { create } from 'zustand';
import { SEED_QUOTES } from '../data/seed-quotes';
import { useToastStore } from './toast-store';

interface QuoteStore {
  quotes: Quote[];
  currentQuote: Quote | null;
  isLoading: boolean;
  error: string | null;
  quoteHistory: string[]; // Array of quote IDs in viewing order
  historyIndex: number; // Current position in history (0 = most recent)
  enabledCategories: QuoteCategory[]; // Categories to show (session-only, not persisted)
  showCustomQuotes: boolean; // Show custom quotes in filter (session-only)

  // Actions
  initialize: () => Promise<void>;
  refreshQuote: () => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  toggleFavorite: (quoteId: string) => Promise<void>;
  hideQuote: (quoteId: string) => Promise<void>;
  unhideQuote: (quoteId: string) => Promise<void>;
  addCustomQuote: (
    text: string,
    author: string,
    category: QuoteCategory,
    source?: string,
    notes?: string
  ) => Promise<void>;
  editQuote: (
    quoteId: string,
    updates: {
      text?: string;
      author?: string;
      category?: QuoteCategory;
      source?: string;
      notes?: string;
    }
  ) => Promise<void>;
  deleteQuote: (quoteId: string) => Promise<void>;
  incrementViewCount: (quoteId: string) => Promise<void>;
  setEnabledCategories: (categories: QuoteCategory[]) => void;
  toggleCategory: (category: QuoteCategory) => void;
  toggleCustomQuotes: () => void;
}

export const useQuoteStore = create<QuoteStore>((set, get) => ({
  quotes: [],
  currentQuote: null,
  isLoading: true,
  error: null,
  quoteHistory: [],
  historyIndex: 0,
  enabledCategories: [...ALL_QUOTE_CATEGORIES],
  showCustomQuotes: true,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      // Get quotes from storage
      let quotes = await getQuotes();

      // If no quotes exist, seed with default quotes
      if (quotes.length === 0) {
        quotes = SEED_QUOTES;
        await setQuotes(quotes);
      }

      // Get current quote or select a random one
      let currentQuote = await getCurrentQuote();
      if (!currentQuote || currentQuote.isHidden) {
        currentQuote = getRandomQuote(quotes);
        if (currentQuote) {
          await setCurrentQuote(currentQuote);
        }
      }

      // Initialize history with current quote
      const quoteHistory = currentQuote ? [currentQuote.id] : [];

      set({ quotes, currentQuote, quoteHistory, historyIndex: 0, isLoading: false });

      // Increment view count for current quote
      if (currentQuote) {
        await get().incrementViewCount(currentQuote.id);
      }
    } catch (error) {
      logger.error('Error initializing quote store', error);
      const errorMessage = 'Failed to load quotes. Please refresh the page.';
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
  },

  refreshQuote: async () => {
    try {
      const {
        quotes,
        currentQuote,
        quoteHistory,
        historyIndex,
        enabledCategories,
        showCustomQuotes,
      } = get();

      // Pass current quote ID, enabled categories, and custom filter
      const newQuote = getRandomQuote(
        quotes,
        currentQuote?.id,
        enabledCategories,
        showCustomQuotes
      );

      if (newQuote) {
        await setCurrentQuote(newQuote);

        // Add to history - if we're not at the most recent position,
        // clear forward history (like browser navigation)
        let updatedHistory = [...quoteHistory];
        if (historyIndex > 0) {
          // Remove forward history
          updatedHistory = updatedHistory.slice(historyIndex);
        }
        // Add new quote to the beginning
        updatedHistory.unshift(newQuote.id);

        set({ currentQuote: newQuote, quoteHistory: updatedHistory, historyIndex: 0 });
        await get().incrementViewCount(newQuote.id);
      } else {
        // No matching quotes found (all filtered out)
        set({ currentQuote: null });
      }
    } catch (error) {
      logger.error('Error refreshing quote', error);
      const errorMessage = 'Failed to refresh quote. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  goBack: async () => {
    try {
      const { quotes, quoteHistory, historyIndex } = get();

      // Check if we can go back
      if (historyIndex >= quoteHistory.length - 1) {
        return;
      }

      const newIndex = historyIndex + 1;
      const quoteId = quoteHistory[newIndex];
      const quote = quotes.find((q) => q.id === quoteId);

      if (quote && !quote.isHidden) {
        await setCurrentQuote(quote);
        set({ currentQuote: quote, historyIndex: newIndex });
        await get().incrementViewCount(quote.id);
      } else {
        // Quote was deleted or hidden, skip it
        set({ historyIndex: newIndex });
        await get().goBack();
      }
    } catch (error) {
      logger.error('Error going back in history', error);
      const errorMessage = 'Failed to navigate back. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  goForward: async () => {
    try {
      const { quotes, quoteHistory, historyIndex } = get();

      // Check if we can go forward
      if (historyIndex <= 0) {
        return;
      }

      const newIndex = historyIndex - 1;
      const quoteId = quoteHistory[newIndex];
      const quote = quotes.find((q) => q.id === quoteId);

      if (quote && !quote.isHidden) {
        await setCurrentQuote(quote);
        set({ currentQuote: quote, historyIndex: newIndex });
        await get().incrementViewCount(quote.id);
      } else {
        // Quote was deleted or hidden, skip it
        set({ historyIndex: newIndex });
        await get().goForward();
      }
    } catch (error) {
      logger.error('Error going forward in history', error);
      const errorMessage = 'Failed to navigate forward. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  canGoBack: () => {
    const { quoteHistory, historyIndex } = get();
    return historyIndex < quoteHistory.length - 1;
  },

  canGoForward: () => {
    const { historyIndex } = get();
    return historyIndex > 0;
  },

  toggleFavorite: async (quoteId: string) => {
    try {
      const { quotes } = get();
      const updatedQuotes = quotes.map((q) =>
        q.id === quoteId ? { ...q, isFavorite: !q.isFavorite } : q
      );

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes });

      // Update current quote if it's the one being favorited
      const currentQuote = get().currentQuote;
      if (currentQuote && currentQuote.id === quoteId) {
        const updatedCurrentQuote = { ...currentQuote, isFavorite: !currentQuote.isFavorite };
        await setCurrentQuote(updatedCurrentQuote);
        set({ currentQuote: updatedCurrentQuote });
      }
    } catch (error) {
      logger.error('Error toggling favorite', error);
      const errorMessage = 'Failed to update favorite. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  hideQuote: async (quoteId: string) => {
    try {
      const { quotes } = get();
      const updatedQuotes = quotes.map((q) => (q.id === quoteId ? { ...q, isHidden: true } : q));

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes });

      // If hiding current quote, get a new one
      const currentQuote = get().currentQuote;
      if (currentQuote && currentQuote.id === quoteId) {
        await get().refreshQuote();
      }
    } catch (error) {
      logger.error('Error hiding quote', error);
      const errorMessage = 'Failed to hide quote. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  addCustomQuote: async (
    text: string,
    author: string,
    category: QuoteCategory,
    source?: string,
    notes?: string
  ) => {
    try {
      const { quotes } = get();
      const newQuote: Quote = {
        id: `custom-${Date.now()}`,
        text,
        author,
        category,
        isCustom: true,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
        source,
        notes,
      };

      const updatedQuotes = [...quotes, newQuote];
      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes });
    } catch (error) {
      logger.error('Error adding custom quote', error);
      const errorMessage = 'Failed to add custom quote. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  incrementViewCount: async (quoteId: string) => {
    try {
      const { quotes } = get();
      const updatedQuotes = quotes.map((q) =>
        q.id === quoteId
          ? { ...q, viewCount: q.viewCount + 1, lastViewed: new Date().toISOString() }
          : q
      );

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes });
    } catch (error) {
      logger.error('Error incrementing view count', error);
    }
  },

  unhideQuote: async (quoteId: string) => {
    try {
      const { quotes } = get();
      const updatedQuotes = quotes.map((q) => (q.id === quoteId ? { ...q, isHidden: false } : q));

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes });
      useToastStore.getState().success('Quote unhidden successfully');
    } catch (error) {
      logger.error('Error unhiding quote', error);
      const errorMessage = 'Failed to unhide quote. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  editQuote: async (quoteId: string, updates) => {
    try {
      const { quotes } = get();
      const updatedQuotes = quotes.map((q) => (q.id === quoteId ? { ...q, ...updates } : q));

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes });

      // Update current quote if it's the one being edited
      const currentQuote = get().currentQuote;
      if (currentQuote && currentQuote.id === quoteId) {
        const updatedCurrentQuote = { ...currentQuote, ...updates };
        await setCurrentQuote(updatedCurrentQuote);
        set({ currentQuote: updatedCurrentQuote });
      }

      useToastStore.getState().success('Quote updated successfully');
    } catch (error) {
      logger.error('Error editing quote', error);
      const errorMessage = 'Failed to update quote. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  deleteQuote: async (quoteId: string) => {
    try {
      const { quotes } = get();
      const updatedQuotes = quotes.filter((q) => q.id !== quoteId);

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes });

      // If deleting current quote, get a new one
      const currentQuote = get().currentQuote;
      if (currentQuote && currentQuote.id === quoteId) {
        await get().refreshQuote();
      }

      useToastStore.getState().success('Quote deleted successfully');
    } catch (error) {
      logger.error('Error deleting quote', error);
      const errorMessage = 'Failed to delete quote. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  setEnabledCategories: (categories: QuoteCategory[]) => {
    set({ enabledCategories: categories });
  },

  toggleCategory: (category: QuoteCategory) => {
    const { enabledCategories } = get();
    const isEnabled = enabledCategories.includes(category);

    if (isEnabled) {
      set({ enabledCategories: enabledCategories.filter((c) => c !== category) });
    } else {
      set({ enabledCategories: [...enabledCategories, category] });
    }
  },

  toggleCustomQuotes: () => {
    const { showCustomQuotes } = get();
    set({ showCustomQuotes: !showCustomQuotes });
  },
}));
