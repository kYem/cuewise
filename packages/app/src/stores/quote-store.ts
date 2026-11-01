import {
  ALL_QUOTE_CATEGORIES,
  assertPersisted,
  buildCustomQuote,
  DEFAULT_SETTINGS,
  logger,
  notifyDeleted,
  notifyMutated,
  type Quote,
  type QuoteCategory,
  STORAGE_KEYS,
  storageWriteErrorMessage,
} from '@cuewise/shared';
import {
  getCollections,
  getCurrentQuote,
  getQuotes,
  getSettings,
  setQuotes,
  updateQuotes,
  withCollectionLock,
} from '@cuewise/storage';
import { create } from 'zustand';
import { SEED_QUOTES } from '../data/seed-quotes';
import { createBulkActions } from './quote-store/bulk-actions';
import { createCollectionActions } from './quote-store/collection-actions';
import {
  CARD_NOT_REMEMBERED,
  navigateHistory,
  persistCurrentQuote,
  persistFilterSettings,
  persistOneQuote,
  pickQuote,
  refreshCardIfQuoteGone,
  reportQuoteGone,
  syncsLocalEdits,
} from './quote-store/helpers';
import type { QuoteStore } from './quote-store/types';
import { createStaleLatch, createStorageObserver, sameEntities } from './storage-changes';
import { useToastStore } from './toast-store';

export type { QuoteWriteOutcome } from './quote-store/types';

const STALE_QUOTES_MESSAGE =
  "Cuewise couldn't re-read your quotes just now, so what you see may be out of date.";

/**
 * The displayed quote and its history are this tab's own. The filters do sync, but as settings —
 * settings-store converges them, and this store's copies go stale until the next initialize().
 */
const quotesObserver = createStorageObserver(
  'quotes',
  [STORAGE_KEYS.SEED_QUOTES, STORAGE_KEYS.CUSTOM_QUOTES, STORAGE_KEYS.COLLECTIONS],
  async () => {
    const [quotes, collections] = await Promise.all([getQuotes(), getCollections()]);
    const current = useQuoteStore.getState();
    const nextQuotes = sameEntities(current.quotes, quotes) ? null : quotes;
    const nextCollections = sameEntities(current.collections, collections) ? null : collections;
    if (nextQuotes === null && nextCollections === null) {
      return;
    }
    useQuoteStore.setState({
      ...(nextQuotes !== null && { quotes: nextQuotes }),
      ...(nextCollections !== null && { collections: nextCollections }),
    });
  },
  createStaleLatch((message) => useToastStore.getState().warning(message), STALE_QUOTES_MESSAGE)
);

export const useQuoteStore = create<QuoteStore>((set, get, api) => ({
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
    // Before the read: a pull landing during it is otherwise announced to nobody.
    quotesObserver.subscribe();
    try {
      set({ isLoading: true, error: null });

      // Seeding rewrites both quote keys, so it may only run on a read that positively answered
      // "nothing is stored" — getQuotes throws rather than reporting a failed read as empty.
      let quotes = await getQuotes();
      if (quotes.length === 0) {
        // Re-checked inside the lock: a pull landing between that read and this write would
        // otherwise be replaced wholesale by the seed set.
        quotes = await withCollectionLock('quotes', async () => {
          const current = await getQuotes();
          if (current.length > 0) {
            return current;
          }
          assertPersisted(await setQuotes(SEED_QUOTES));
          return SEED_QUOTES;
        });
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

      // The stored card is a snapshot: only its id is trusted, and the quote itself is taken
      // from the list. Reading its fields back would show a quote another device has since
      // hidden or edited, and nothing converges this key.
      const stored = await getCurrentQuote();
      const storedId = stored === null ? null : stored.id;
      let currentQuote = quotes.find((q) => q.id === storedId) ?? null;
      if (currentQuote === null || currentQuote.isHidden) {
        currentQuote = pickQuote(quotes, {
          enabledCategories,
          showCustomQuotes,
          showFavoritesOnly,
          activeCollectionIds,
        });
        if (currentQuote) {
          await persistCurrentQuote(currentQuote, 'initialize');
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
      // One message for both: the panel and the toast disagreeing about the same failure is
      // worse than either wording.
      const errorMessage = storageWriteErrorMessage(
        error,
        'Failed to load quotes. Please refresh the page.'
      );
      set({ error: errorMessage, isLoading: false });
      useToastStore.getState().error(errorMessage);
    }
    // Awaited, last, and outside the try so a failed load still reconciles: it re-reads storage,
    // so it has to see everything this load wrote (the seed, the view-count bump).
    await quotesObserver.reconcile();
  },

  refreshQuote: async (options = {}) => {
    try {
      const state = get();
      const { quotes, currentQuote, quoteHistory, historyIndex } = state;
      const newQuote = pickQuote(quotes, state, currentQuote?.id);

      if (newQuote) {
        // Only a deliberate reroll is worth reporting: the interval calls this unprompted, and
        // the writers that call it are already rerolling a quote that is gone or hidden.
        const remembered = await persistCurrentQuote(newQuote, 'refreshQuote');
        if (!remembered && options.userInitiated === true) {
          useToastStore.getState().warning(CARD_NOT_REMEMBERED, { collapseRepeats: true });
        }

        // Add to history - if we're not at the most recent position,
        // clear forward history (like browser navigation)
        let updatedHistory = [...quoteHistory];
        if (historyIndex > 0) {
          // Remove forward history
          updatedHistory = updatedHistory.slice(historyIndex);
        }
        // Add new quote to the beginning
        updatedHistory.unshift(newQuote.id);

        // Cleared only on a real quote: producing none is not success, and clearing there
        // hides a failed load behind "No quotes available", whose retry never runs initialize.
        set({ currentQuote: newQuote, quoteHistory: updatedHistory, historyIndex: 0, error: null });
        await get().incrementViewCount(newQuote.id);
      } else {
        // No matching quotes found (all filtered out)
        set({ currentQuote: null });
      }
    } catch (error) {
      logger.error('Error refreshing quote', error);
      const errorMessage = 'Failed to refresh quote. Please try again.';
      // The new-tab interval calls this unprompted on every tick, so latching `error` would
      // replace the card with a load-failure panel the user never asked for, and an uncollapsed
      // toast would stack one copy per tick.
      useToastStore.getState().error(errorMessage, { collapseRepeats: true });
    }
  },

  goBack: async () => {
    await navigateHistory(get, set, 'back');
  },

  goForward: async () => {
    await navigateHistory(get, set, 'forward');
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
      const write = await persistOneQuote(quoteId, (q) => ({
        ...q,
        isFavorite: !q.isFavorite,
      }));
      if (write.kind === 'gone') {
        set({ quotes: write.quotes });
        reportQuoteGone('toggleFavorite', quoteId);
        await refreshCardIfQuoteGone(quoteId, write.quotes, get);
        return;
      }
      const { quotes: updatedQuotes, target } = write;
      set({ quotes: updatedQuotes });
      if (syncsLocalEdits(target)) {
        notifyMutated('quotes', quoteId);
      }

      // The persisted value, not a re-toggle of the snapshot: a pull may have flipped the flag.
      const currentQuote = get().currentQuote;
      if (currentQuote && currentQuote.id === quoteId) {
        await persistCurrentQuote(target, 'toggleFavorite');
        set({ currentQuote: target });
      }
    } catch (error) {
      logger.error('Error toggling favorite', error);
      const errorMessage = 'Failed to update favorite. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
    }
  },

  hideQuote: async (quoteId: string) => {
    try {
      const write = await persistOneQuote(quoteId, (q) => ({
        ...q,
        isHidden: true,
      }));
      set({ quotes: write.quotes });
      // No early return: the refresh below is what the user asked for either way.
      if (write.kind === 'gone') {
        reportQuoteGone('hideQuote', quoteId);
      } else if (syncsLocalEdits(write.target)) {
        notifyMutated('quotes', quoteId);
      }

      // If hiding current quote, get a new one
      const currentQuote = get().currentQuote;
      if (currentQuote && currentQuote.id === quoteId) {
        await get().refreshQuote();
      }
    } catch (error) {
      logger.error('Error hiding quote', error);
      const errorMessage = 'Failed to hide quote. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
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
      const newQuote = buildCustomQuote({ text, author, category, source, notes });

      const { result, quotes: updatedQuotes } = await updateQuotes((current) => [
        ...current,
        newQuote,
      ]);
      assertPersisted(result);
      set({ quotes: updatedQuotes });
      notifyMutated('quotes', newQuote.id);
      return true;
    } catch (error) {
      logger.error('Error adding custom quote', error);
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, 'Failed to add custom quote. Please try again.'));
      return false;
    }
  },

  // No toast on any path: the count is telemetry the user never asked for, and a failed
  // increment is dropped rather than retried.
  incrementViewCount: async (quoteId: string) => {
    try {
      const write = await persistOneQuote(quoteId, (q) => ({
        ...q,
        viewCount: q.viewCount + 1,
        lastViewed: new Date().toISOString(),
      }));
      if (write.kind === 'gone') {
        set({ quotes: write.quotes });
        // error, not warn: the shipped logLevel is 'error'. Every other gone path moves the card;
        // this one is where the phantom would otherwise survive.
        logger.error(`incrementViewCount: quote ${quoteId} was gone before the write`);
        // Picked here rather than through refreshQuote: that is usually our own caller, and
        // going back through it recurses until the heap dies when storage keeps answering a
        // list without the quote just handed out.
        if (get().currentQuote?.id === quoteId) {
          // Through the same filters refreshQuote uses: an unfiltered pick can land on a
          // category the user turned off, or outside the collection they are looking at.
          const state = get();
          const replacement = pickQuote(write.quotes, state, quoteId);
          // The history slot holds the id we just found gone, at every entry point. Leaving it
          // there makes forward navigation land on a quote that no longer exists.
          const history = [...state.quoteHistory];
          if (replacement === null) {
            history.splice(state.historyIndex, 1);
          } else {
            history[state.historyIndex] = replacement.id;
          }
          set({ currentQuote: replacement, quoteHistory: history });
          if (replacement !== null) {
            await persistCurrentQuote(replacement, 'incrementViewCount');
          }
        }
        return;
      }
      set({ quotes: write.quotes });
    } catch (error) {
      logger.error('Error incrementing view count', error, { quoteId });
    }
  },

  unhideQuote: async (quoteId: string) => {
    try {
      const write = await persistOneQuote(quoteId, (q) => ({
        ...q,
        isHidden: false,
      }));
      if (write.kind === 'gone') {
        set({ quotes: write.quotes });
        reportQuoteGone('unhideQuote', quoteId);
        await refreshCardIfQuoteGone(quoteId, write.quotes, get);
        return;
      }
      const { quotes: updatedQuotes, target } = write;
      set({ quotes: updatedQuotes });
      if (syncsLocalEdits(target)) {
        notifyMutated('quotes', quoteId);
      }
      useToastStore.getState().success('Quote unhidden successfully');
    } catch (error) {
      logger.error('Error unhiding quote', error);
      const errorMessage = 'Failed to unhide quote. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
    }
  },

  editQuote: async (quoteId: string, updates) => {
    try {
      const write = await persistOneQuote(quoteId, (q) => ({
        ...q,
        ...updates,
      }));
      if (write.kind === 'gone') {
        set({ quotes: write.quotes });
        reportQuoteGone('editQuote', quoteId);
        await refreshCardIfQuoteGone(quoteId, write.quotes, get);
        return 'gone';
      }
      const { quotes: updatedQuotes, target } = write;
      set({ quotes: updatedQuotes });
      if (syncsLocalEdits(target)) {
        notifyMutated('quotes', quoteId);
      }

      const currentQuote = get().currentQuote;
      if (currentQuote && currentQuote.id === quoteId) {
        await persistCurrentQuote(target, 'editQuote');
        set({ currentQuote: target });
      }

      useToastStore.getState().success('Quote updated successfully');
      return 'saved';
    } catch (error) {
      logger.error('Error editing quote', error);
      const errorMessage = 'Failed to update quote. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      return 'failed';
    }
  },

  deleteQuote: async (quoteId: string) => {
    try {
      // Captured inside the mutator: a tombstone for one this write never deleted is
      // authorship we do not have.
      const deleted: { target: Quote | null } = { target: null };
      const { result, quotes: updatedQuotes } = await updateQuotes((current) =>
        current.filter((q) => {
          if (q.id !== quoteId) {
            return true;
          }
          deleted.target = q;
          return false;
        })
      );
      // Ahead of assertPersisted: nothing matched, so the list is unchanged and a failed write
      // would tell the user to free space for a delete that has already happened.
      if (deleted.target === null) {
        set({ quotes: updatedQuotes });
        reportQuoteGone('deleteQuote', quoteId);
        await refreshCardIfQuoteGone(quoteId, updatedQuotes, get);
        return;
      }
      assertPersisted(result);
      set({ quotes: updatedQuotes });
      if (syncsLocalEdits(deleted.target)) {
        notifyDeleted('quotes', quoteId);
      }

      if (get().currentQuote?.id === quoteId) {
        await get().refreshQuote();
      }
      useToastStore.getState().success('Quote deleted successfully');
    } catch (error) {
      logger.error('Error deleting quote', error);
      const errorMessage = 'Failed to delete quote. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
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

  ...createBulkActions(set, get, api),
  ...createCollectionActions(set, get, api),
}));
