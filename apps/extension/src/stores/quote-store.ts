import { getRandomQuote, type Quote, type QuoteCategory } from '@productivity-extension/shared';
import {
  getCurrentQuote,
  getQuotes,
  setCurrentQuote,
  setQuotes,
} from '@productivity-extension/storage';
import { create } from 'zustand';
import { SEED_QUOTES } from '../data/seed-quotes';

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
  addCustomQuote: (text: string, author: string, category: QuoteCategory) => Promise<void>;
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
      console.error('Error initializing quote store:', error);
      set({ error: 'Failed to load quotes', isLoading: false });
    }
  },

  refreshQuote: async () => {
    try {
      const { quotes } = get();
      const newQuote = getRandomQuote(quotes);

      if (newQuote) {
        await setCurrentQuote(newQuote);
        set({ currentQuote: newQuote });
        await get().incrementViewCount(newQuote.id);
      }
    } catch (error) {
      console.error('Error refreshing quote:', error);
      set({ error: 'Failed to refresh quote' });
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
      console.error('Error toggling favorite:', error);
      set({ error: 'Failed to update favorite' });
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
      console.error('Error hiding quote:', error);
      set({ error: 'Failed to hide quote' });
    }
  },

  addCustomQuote: async (text: string, author: string, category: QuoteCategory) => {
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
      };

      const updatedQuotes = [...quotes, newQuote];
      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes });
    } catch (error) {
      console.error('Error adding custom quote:', error);
      set({ error: 'Failed to add custom quote' });
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
      console.error('Error incrementing view count:', error);
    }
  },
}));
