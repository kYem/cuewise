import { getRandomQuote, logger, type Quote, type QuoteCategory } from '@cuewise/shared';
import { getCurrentQuote, getQuotes, setCurrentQuote, setQuotes } from '@cuewise/storage';
import { create } from 'zustand';
import { SEED_QUOTES } from '../data/seed-quotes';
import { useToastStore } from './toast-store';

interface QuoteStore {
  quotes: Quote[];
  currentQuote: Quote | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  refreshQuote: () => Promise<void>;
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
}

export const useQuoteStore = create<QuoteStore>((set, get) => ({
  quotes: [],
  currentQuote: null,
  isLoading: true,
  error: null,

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

      set({ quotes, currentQuote, isLoading: false });

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
      const { quotes, currentQuote } = get();

      // Pass current quote ID to avoid getting the same quote twice in a row
      const newQuote = getRandomQuote(quotes, currentQuote?.id);

      if (newQuote) {
        await setCurrentQuote(newQuote);
        set({ currentQuote: newQuote });
        await get().incrementViewCount(newQuote.id);
      }
    } catch (error) {
      logger.error('Error refreshing quote', error);
      const errorMessage = 'Failed to refresh quote. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
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
}));
