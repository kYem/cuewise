import {
  ALL_QUOTE_CATEGORIES,
  type BulkImportResult,
  type CSVQuoteRow,
  DEFAULT_SETTINGS,
  generateId,
  getRandomQuote,
  logger,
  type Quote,
  type QuoteCategory,
  type QuoteCollection,
} from '@cuewise/shared';
import {
  getCollections,
  getCurrentQuote,
  getQuotes,
  getSettings,
  setCollections,
  setCurrentQuote,
  setQuotes,
  setSettings,
} from '@cuewise/storage';
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
  enabledCategories: QuoteCategory[]; // Categories to show (persisted to settings)
  showCustomQuotes: boolean; // Show custom quotes in filter (persisted to settings)
  showFavoritesOnly: boolean; // Show only favorite quotes (persisted to settings)

  // Collections state
  collections: QuoteCollection[];
  activeCollectionIds: string[]; // Enabled collection filters (persisted to settings)

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
  setEnabledCategories: (categories: QuoteCategory[]) => Promise<void>;
  toggleCategory: (category: QuoteCategory) => Promise<void>;
  toggleCustomQuotes: () => Promise<void>;
  toggleFavoritesOnly: () => Promise<void>;

  // Bulk operations
  bulkDelete: (quoteIds: string[]) => Promise<void>;
  bulkToggleFavorite: (quoteIds: string[], setFavorite: boolean) => Promise<void>;
  bulkToggleHidden: (quoteIds: string[], setHidden: boolean) => Promise<void>;

  // Restoration operations
  restoreMissingQuotes: () => Promise<{ restored: number }>;
  resetAllQuotes: () => Promise<void>;
  getMissingSeedQuoteCount: () => number;

  // Collection operations
  createCollection: (name: string, description?: string) => Promise<boolean>;
  updateCollection: (
    id: string,
    updates: Partial<Pick<QuoteCollection, 'name' | 'description'>>
  ) => Promise<boolean>;
  deleteCollection: (id: string) => Promise<boolean>;
  addQuoteToCollection: (quoteId: string, collectionId: string) => Promise<boolean>;
  removeQuoteFromCollection: (quoteId: string, collectionId: string) => Promise<boolean>;
  addQuotesToCollection: (quoteIds: string[], collectionId: string) => Promise<boolean>;
  toggleCollection: (collectionId: string) => Promise<void>;
  setActiveCollectionIds: (collectionIds: string[]) => Promise<void>;
  getQuotesInCollection: (collectionId: string) => Quote[];

  // CSV Import
  bulkAddQuotes: (quoteRows: CSVQuoteRow[], collectionId?: string) => Promise<BulkImportResult>;
}

/**
 * Persists current filter settings to storage.
 * Called when filter state changes (categories, custom, favorites, collections).
 * Shows a warning toast if persistence fails (non-blocking - filter still works in memory).
 */
async function persistFilterSettings(state: QuoteStore): Promise<void> {
  try {
    const currentSettings = await getSettings();
    const updatedSettings = {
      ...currentSettings,
      quoteFilterEnabledCategories: state.enabledCategories,
      quoteFilterShowCustomQuotes: state.showCustomQuotes,
      quoteFilterShowFavoritesOnly: state.showFavoritesOnly,
      quoteFilterActiveCollectionIds: state.activeCollectionIds,
    };
    await setSettings(updatedSettings);
  } catch (error) {
    logger.error('Error persisting filter settings', error);
    useToastStore
      .getState()
      .warning('Failed to save filter preferences. Your changes may not persist.');
  }
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
  showFavoritesOnly: false,
  collections: [],
  activeCollectionIds: [],

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

      // Get collections from storage
      const collections = await getCollections();

      // Load persisted filter settings
      const settings = await getSettings();
      const enabledCategories =
        settings?.quoteFilterEnabledCategories ?? DEFAULT_SETTINGS.quoteFilterEnabledCategories;
      const showCustomQuotes =
        settings?.quoteFilterShowCustomQuotes ?? DEFAULT_SETTINGS.quoteFilterShowCustomQuotes;
      const showFavoritesOnly =
        settings?.quoteFilterShowFavoritesOnly ?? DEFAULT_SETTINGS.quoteFilterShowFavoritesOnly;
      // Filter out any collection IDs that no longer exist
      const collectionIds = new Set(collections.map((c) => c.id));
      const activeCollectionIds = (
        settings?.quoteFilterActiveCollectionIds ?? DEFAULT_SETTINGS.quoteFilterActiveCollectionIds
      ).filter((id) => collectionIds.has(id));

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

      set({
        quotes,
        currentQuote,
        quoteHistory,
        historyIndex: 0,
        collections,
        enabledCategories,
        showCustomQuotes,
        showFavoritesOnly,
        activeCollectionIds,
        isLoading: false,
      });

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
        showFavoritesOnly,
        activeCollectionIds,
      } = get();

      // Pass current quote ID, enabled categories, custom filter, favorites filter, and collection filter
      const newQuote = getRandomQuote(
        quotes,
        currentQuote?.id,
        enabledCategories,
        showCustomQuotes,
        showFavoritesOnly,
        activeCollectionIds
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

  setEnabledCategories: async (categories: QuoteCategory[]) => {
    set({ enabledCategories: categories });
    await persistFilterSettings(get());
  },

  toggleCategory: async (category: QuoteCategory) => {
    const { enabledCategories } = get();
    const isEnabled = enabledCategories.includes(category);

    if (isEnabled) {
      set({ enabledCategories: enabledCategories.filter((c) => c !== category) });
    } else {
      set({ enabledCategories: [...enabledCategories, category] });
    }
    await persistFilterSettings(get());
  },

  toggleCustomQuotes: async () => {
    const { showCustomQuotes } = get();
    set({ showCustomQuotes: !showCustomQuotes });
    await persistFilterSettings(get());
  },

  toggleFavoritesOnly: async () => {
    const { showFavoritesOnly } = get();
    set({ showFavoritesOnly: !showFavoritesOnly });
    await persistFilterSettings(get());
  },

  // Bulk operations
  bulkDelete: async (quoteIds: string[]) => {
    try {
      const { quotes, currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      const updatedQuotes = quotes.filter((q) => !quoteIdSet.has(q.id));

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes, error: null });

      // If current quote was deleted, refresh to a new one
      if (currentQuote && quoteIdSet.has(currentQuote.id)) {
        await get().refreshQuote();
      }

      useToastStore.getState().success(`Deleted ${quoteIds.length} quotes`);
    } catch (error) {
      logger.error('Error bulk deleting quotes', error, { quoteIds, count: quoteIds.length });
      const errorMessage = 'Failed to delete quotes. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  bulkToggleFavorite: async (quoteIds: string[], setFavorite: boolean) => {
    try {
      const { quotes, currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      const updatedQuotes = quotes.map((q) =>
        quoteIdSet.has(q.id) ? { ...q, isFavorite: setFavorite } : q
      );

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes, error: null });

      // Update current quote if it was in the selection
      if (currentQuote && quoteIdSet.has(currentQuote.id)) {
        const updatedCurrentQuote = { ...currentQuote, isFavorite: setFavorite };
        await setCurrentQuote(updatedCurrentQuote);
        set({ currentQuote: updatedCurrentQuote });
      }

      const action = setFavorite ? 'added to favorites' : 'removed from favorites';
      useToastStore.getState().success(`${quoteIds.length} quotes ${action}`);
    } catch (error) {
      logger.error('Error bulk toggling favorites', error, {
        quoteIds,
        setFavorite,
        count: quoteIds.length,
      });
      const errorMessage = 'Failed to update favorites. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  bulkToggleHidden: async (quoteIds: string[], setHidden: boolean) => {
    try {
      const { quotes, currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      const updatedQuotes = quotes.map((q) =>
        quoteIdSet.has(q.id) ? { ...q, isHidden: setHidden } : q
      );

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes, error: null });

      // If hiding current quote, refresh to a new one
      if (setHidden && currentQuote && quoteIdSet.has(currentQuote.id)) {
        await get().refreshQuote();
      }

      const action = setHidden ? 'hidden' : 'unhidden';
      useToastStore.getState().success(`${quoteIds.length} quotes ${action}`);
    } catch (error) {
      logger.error('Error bulk toggling hidden', error, {
        quoteIds,
        setHidden,
        count: quoteIds.length,
      });
      const errorMessage = 'Failed to update quotes. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
    }
  },

  // Restoration operations
  restoreMissingQuotes: async () => {
    try {
      const { quotes } = get();
      const existingIds = new Set(quotes.map((q) => q.id));

      // Find seed quotes that are missing from current quotes
      const missingQuotes = SEED_QUOTES.filter((sq) => !existingIds.has(sq.id));

      if (missingQuotes.length === 0) {
        useToastStore.getState().info('All default quotes are already present');
        return { restored: 0 };
      }

      // Add missing quotes back
      const updatedQuotes = [...quotes, ...missingQuotes];

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes, error: null });

      useToastStore.getState().success(`Restored ${missingQuotes.length} missing quotes`);
      return { restored: missingQuotes.length };
    } catch (error) {
      logger.error('Error restoring missing quotes', error);
      const errorMessage = 'Failed to restore quotes. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
    }
  },

  resetAllQuotes: async () => {
    try {
      // Create fresh copy of seed quotes with default properties
      const freshQuotes = SEED_QUOTES.map((q) => ({
        ...q,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
        lastViewed: undefined,
      }));

      await setQuotes(freshQuotes);
      set({ quotes: freshQuotes, error: null });

      // Reset current quote to a random one
      const newCurrent = getRandomQuote(freshQuotes);
      if (newCurrent) {
        await setCurrentQuote(newCurrent);
        set({
          currentQuote: newCurrent,
          quoteHistory: [newCurrent.id],
          historyIndex: 0,
        });
      }

      useToastStore.getState().success('All quotes reset to defaults');
    } catch (error) {
      logger.error('Error resetting quotes', error);
      const errorMessage = 'Failed to reset quotes. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      throw error;
    }
  },

  getMissingSeedQuoteCount: () => {
    const { quotes } = get();
    const existingIds = new Set(quotes.map((q) => q.id));
    return SEED_QUOTES.filter((sq) => !existingIds.has(sq.id)).length;
  },

  // Collection operations
  createCollection: async (name: string, description?: string) => {
    try {
      const { collections } = get();
      const now = new Date().toISOString();

      const newCollection: QuoteCollection = {
        id: generateId(),
        name: name.trim(),
        description: description?.trim(),
        createdAt: now,
      };

      const updatedCollections = [...collections, newCollection];
      await setCollections(updatedCollections);
      set({ collections: updatedCollections, error: null });

      useToastStore.getState().success(`Collection "${name}" created`);
      return true;
    } catch (error) {
      logger.error('Error creating collection', error);
      const errorMessage = 'Failed to create collection. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  updateCollection: async (id: string, updates) => {
    try {
      const { collections } = get();
      const now = new Date().toISOString();

      const updatedCollections = collections.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: now } : c
      );

      await setCollections(updatedCollections);
      set({ collections: updatedCollections, error: null });

      useToastStore.getState().success('Collection updated');
      return true;
    } catch (error) {
      logger.error('Error updating collection', error);
      const errorMessage = 'Failed to update collection. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  deleteCollection: async (id: string) => {
    try {
      const { collections, quotes, activeCollectionIds } = get();

      // Remove collection
      const updatedCollections = collections.filter((c) => c.id !== id);
      await setCollections(updatedCollections);

      // Remove collection ID from all quotes that had it
      const updatedQuotes = quotes.map((q) => {
        if (q.collectionIds?.includes(id)) {
          return {
            ...q,
            collectionIds: q.collectionIds.filter((cId) => cId !== id),
          };
        }
        return q;
      });
      await setQuotes(updatedQuotes);

      // Remove deleted collection from active filters
      const newActiveIds = activeCollectionIds.filter((cId) => cId !== id);

      set({
        collections: updatedCollections,
        quotes: updatedQuotes,
        activeCollectionIds: newActiveIds,
        error: null,
      });

      // Persist updated filter settings (collection removed from active filters)
      await persistFilterSettings(get());

      useToastStore.getState().success('Collection deleted');
      return true;
    } catch (error) {
      logger.error('Error deleting collection', error);
      const errorMessage = 'Failed to delete collection. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  addQuoteToCollection: async (quoteId: string, collectionId: string) => {
    try {
      const { quotes, currentQuote } = get();

      const updatedQuotes = quotes.map((q) => {
        if (q.id === quoteId) {
          const currentIds = q.collectionIds ?? [];
          if (currentIds.includes(collectionId)) {
            return q; // Already in collection
          }
          return { ...q, collectionIds: [...currentIds, collectionId] };
        }
        return q;
      });

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes, error: null });

      // Update current quote if it was the one modified
      if (currentQuote && currentQuote.id === quoteId) {
        const updatedCurrentQuote = updatedQuotes.find((q) => q.id === quoteId);
        if (updatedCurrentQuote) {
          await setCurrentQuote(updatedCurrentQuote);
          set({ currentQuote: updatedCurrentQuote });
        }
      }

      return true;
    } catch (error) {
      logger.error('Error adding quote to collection', error);
      const errorMessage = 'Failed to add quote to collection. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  removeQuoteFromCollection: async (quoteId: string, collectionId: string) => {
    try {
      const { quotes, currentQuote } = get();

      const updatedQuotes = quotes.map((q) => {
        if (q.id === quoteId && q.collectionIds) {
          return {
            ...q,
            collectionIds: q.collectionIds.filter((cId) => cId !== collectionId),
          };
        }
        return q;
      });

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes, error: null });

      // Update current quote if it was the one modified
      if (currentQuote && currentQuote.id === quoteId) {
        const updatedCurrentQuote = updatedQuotes.find((q) => q.id === quoteId);
        if (updatedCurrentQuote) {
          await setCurrentQuote(updatedCurrentQuote);
          set({ currentQuote: updatedCurrentQuote });
        }
      }

      return true;
    } catch (error) {
      logger.error('Error removing quote from collection', error);
      const errorMessage = 'Failed to remove quote from collection. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  addQuotesToCollection: async (quoteIds: string[], collectionId: string) => {
    try {
      const { quotes, collections } = get();
      const quoteIdSet = new Set(quoteIds);

      const updatedQuotes = quotes.map((q) => {
        if (quoteIdSet.has(q.id)) {
          const currentIds = q.collectionIds ?? [];
          if (currentIds.includes(collectionId)) {
            return q; // Already in collection
          }
          return { ...q, collectionIds: [...currentIds, collectionId] };
        }
        return q;
      });

      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes, error: null });

      const collection = collections.find((c) => c.id === collectionId);
      const collectionName = collection?.name ?? 'collection';
      useToastStore.getState().success(`${quoteIds.length} quotes added to "${collectionName}"`);

      return true;
    } catch (error) {
      logger.error('Error adding quotes to collection', error);
      const errorMessage = 'Failed to add quotes to collection. Please try again.';
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return false;
    }
  },

  toggleCollection: async (collectionId: string) => {
    const { activeCollectionIds } = get();
    if (activeCollectionIds.includes(collectionId)) {
      set({ activeCollectionIds: activeCollectionIds.filter((id) => id !== collectionId) });
    } else {
      set({ activeCollectionIds: [...activeCollectionIds, collectionId] });
    }
    await persistFilterSettings(get());
  },

  setActiveCollectionIds: async (collectionIds: string[]) => {
    set({ activeCollectionIds: collectionIds });
    await persistFilterSettings(get());
  },

  getQuotesInCollection: (collectionId: string) => {
    const { quotes } = get();
    return quotes.filter((q) => q.collectionIds?.includes(collectionId));
  },

  // CSV Import - Bulk add quotes with optional collection assignment
  bulkAddQuotes: async (quoteRows: CSVQuoteRow[], collectionId?: string) => {
    const result: BulkImportResult = {
      success: false,
      imported: 0,
      failed: 0,
      errors: [],
    };

    if (quoteRows.length === 0) {
      result.errors.push('No quotes to import');
      return result;
    }

    try {
      const { quotes } = get();
      const timestamp = Date.now();

      // Create Quote objects from CSV rows
      const newQuotes: Quote[] = quoteRows.map((row, index) => ({
        id: `custom-${timestamp}-${index}`,
        text: row.text,
        author: row.author,
        category: row.category || 'inspiration',
        isCustom: true,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
        source: row.source,
        notes: row.notes,
        collectionIds: collectionId ? [collectionId] : undefined,
      }));

      // Add to existing quotes
      const updatedQuotes = [...quotes, ...newQuotes];
      await setQuotes(updatedQuotes);
      set({ quotes: updatedQuotes, error: null });

      result.success = true;
      result.imported = newQuotes.length;

      const collectionText = collectionId ? ' and added to collection' : '';
      useToastStore.getState().success(`Imported ${newQuotes.length} quotes${collectionText}`);

      return result;
    } catch (error) {
      logger.error('Error bulk adding quotes', error);
      const errorMessage = 'Failed to import quotes. Please try again.';
      result.errors.push(errorMessage);
      set({ error: errorMessage });
      useToastStore.getState().error(errorMessage);
      return result;
    }
  },
}));
