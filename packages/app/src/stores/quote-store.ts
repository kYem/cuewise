import {
  ALL_QUOTE_CATEGORIES,
  assertPersisted,
  type BulkImportResult,
  type CSVQuoteRow,
  DEFAULT_SETTINGS,
  generateId,
  getRandomQuote,
  logger,
  notifyDeleted,
  notifyMutated,
  notifyMutatedBulk,
  type Quote,
  type QuoteCategory,
  type QuoteCollection,
  STORAGE_KEYS,
  storageWriteErrorMessage,
} from '@cuewise/shared';
import {
  getCollections,
  getCurrentQuote,
  getQuotes,
  getQuotesRaw,
  getSettings,
  type StorageResult,
  setCurrentQuote,
  setQuotes,
  setQuotesRaw,
  updateCollections,
  updateQuotes,
  withCollectionLock,
} from '@cuewise/storage';
import { create } from 'zustand';
import { SEED_QUOTES } from '../data/seed-quotes';
import { useSettingsStore } from './settings-store';
import { createStaleLatch, createStorageObserver, sameEntities } from './storage-changes';
import { useToastStore } from './toast-store';

/** Seed quotes not present in the given list, keyed by id. */
function getMissingSeedQuotes(quotes: Quote[]): Quote[] {
  const existingIds = new Set(quotes.map((q) => q.id));
  return SEED_QUOTES.filter((sq) => !existingIds.has(sq.id));
}

/**
 * Step one entry through quote history. 'back' moves toward older quotes, 'forward' toward
 * newer ones. Hidden/deleted quotes are skipped by recursing in the same direction.
 */
async function navigateHistory(
  get: () => QuoteStore,
  set: (partial: Partial<QuoteStore>) => void,
  direction: 'back' | 'forward'
): Promise<void> {
  const isBack = direction === 'back';
  try {
    const { quotes, quoteHistory, historyIndex } = get();

    // Already at the end of history in this direction
    if (isBack ? historyIndex >= quoteHistory.length - 1 : historyIndex <= 0) {
      return;
    }

    const newIndex = isBack ? historyIndex + 1 : historyIndex - 1;
    const quoteId = quoteHistory[newIndex];
    const quote = quotes.find((q) => q.id === quoteId);

    if (quote && !quote.isHidden) {
      await persistCurrentQuote(quote, 'navigateHistory');
      set({ currentQuote: quote, historyIndex: newIndex });
      await get().incrementViewCount(quote.id);
    } else {
      // Quote was deleted or hidden, skip it
      set({ historyIndex: newIndex });
      await navigateHistory(get, set, direction);
    }
  } catch (error) {
    logger.error(`Error going ${direction} in history`, error);
    // Not `error` state: both renderers read that as "the load failed" and replace the page.
    // A single action that failed has its toast.
    useToastStore.getState().error(`Failed to navigate ${direction}. Please try again.`);
  }
}

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
  /** False when the write did not persist, so the form can keep what the user typed. */
  addCustomQuote: (
    text: string,
    author: string,
    category: QuoteCategory,
    source?: string,
    notes?: string
  ) => Promise<boolean>;
  /** 'gone' when a pull deleted it first, 'failed' when the write did not persist. */
  editQuote: (
    quoteId: string,
    updates: {
      text?: string;
      author?: string;
      category?: QuoteCategory;
      source?: string;
      notes?: string;
    }
  ) => Promise<QuoteWriteOutcome>;
  deleteQuote: (quoteId: string) => Promise<void>;
  incrementViewCount: (quoteId: string) => Promise<void>;
  setEnabledCategories: (categories: QuoteCategory[]) => Promise<void>;
  toggleCategory: (category: QuoteCategory) => Promise<void>;
  toggleCustomQuotes: () => Promise<void>;
  toggleFavoritesOnly: () => Promise<void>;

  // Bulk operations
  /** False when the write did not persist, so the caller can keep the user's selection. */
  bulkDelete: (quoteIds: string[]) => Promise<boolean>;
  bulkToggleFavorite: (quoteIds: string[], setFavorite: boolean) => Promise<boolean>;
  bulkToggleHidden: (quoteIds: string[], setHidden: boolean) => Promise<boolean>;

  // Restoration operations
  restoreMissingQuotes: () => Promise<{ restored: number }>;
  resetAllQuotes: () => Promise<void>;
  getMissingSeedQuoteCount: () => number;

  // Collection operations
  createCollection: (name: string, description?: string) => Promise<boolean>;
  /** 'gone' when a pull deleted it first — the store has already told the user, so do not retry. */
  updateCollection: (
    id: string,
    updates: Partial<Pick<QuoteCollection, 'name' | 'description'>>
  ) => Promise<QuoteWriteOutcome>;
  deleteCollection: (id: string) => Promise<boolean>;
  /** 'gone' when a pull deleted the quote first, 'failed' when the write did not persist. */
  addQuoteToCollection: (quoteId: string, collectionId: string) => Promise<QuoteWriteOutcome>;
  removeQuoteFromCollection: (quoteId: string, collectionId: string) => Promise<QuoteWriteOutcome>;
  addQuotesToCollection: (quoteIds: string[], collectionId: string) => Promise<boolean>;
  toggleCollection: (collectionId: string) => Promise<void>;
  setActiveCollectionIds: (collectionIds: string[]) => Promise<void>;
  getQuotesInCollection: (collectionId: string) => Quote[];

  // CSV Import
  bulkAddQuotes: (quoteRows: CSVQuoteRow[], collectionId?: string) => Promise<BulkImportResult>;
}

/**
 * Persists current filter settings. Goes through the settings store rather than storage directly:
 * that path is serialized against other settings writes, checks the result, surfaces its own error
 * toast, and notifies sync for each changed key (the quoteFilter* keys are not device-local).
 */
async function persistFilterSettings(state: QuoteStore): Promise<void> {
  await useSettingsStore.getState().updateSettings({
    quoteFilterEnabledCategories: state.enabledCategories,
    quoteFilterShowCustomQuotes: state.showCustomQuotes,
    quoteFilterShowFavoritesOnly: state.showFavoritesOnly,
    quoteFilterActiveCollectionIds: state.activeCollectionIds,
  });
}

/**
 * Change one quote inside the lock. `target` is null when the locked read no longer held the id —
 * announcing that write would mark a gone id dirty, which pushes as a tombstone. `change` must
 * return a quote: it reads `target` back out of the written list, so a removal reads as gone.
 */
async function persistOneQuote(
  quoteId: string,
  change: (quote: Quote) => Quote
): Promise<{ result: StorageResult; quotes: Quote[]; target: Quote | null }> {
  // Its own lock rather than updateQuotes, so a gone id skips the write entirely: rewriting an
  // identical list can still fail, and the caller would report that instead of the gone.
  return withCollectionLock('quotes', async () => {
    const current = await getQuotes();
    if (!current.some((q) => q.id === quoteId)) {
      return { result: { success: true } as StorageResult, quotes: current, target: null };
    }
    const quotes = current.map((q) => (q.id === quoteId ? change(q) : q));
    return {
      result: await setQuotes(quotes),
      quotes,
      target: quotes.find((q) => q.id === quoteId) ?? null,
    };
  });
}

/**
 * Seed quotes do reach the account — the enroll backfill claims every stored id — but only a
 * custom quote's edit is announced from here, so a seed edit stays on this device.
 */
function syncsLocalEdits(quote: Quote | null): boolean {
  return quote?.isCustom === true;
}

/**
 * The card's own key, which `initialize` reads back verbatim — so losing this write leaves the
 * card showing the pre-edit quote on every later tab while the list shows the new one.
 *
 * Answers rather than throwing: several callers are background ticks with nothing to tell, and
 * at the rest the list write has already landed, so a throw here would report the whole action
 * as failed. `getStorageArea` can reject, so both exits have to end up in the same place.
 */
async function persistCurrentQuote(quote: Quote, action: string): Promise<boolean> {
  try {
    const result = await setCurrentQuote(quote);
    if (result?.success !== true) {
      logger.error(`${action}: could not persist the displayed quote`, result?.error, {
        quoteId: quote.id,
      });
      return false;
    }
    return true;
  } catch (error) {
    logger.error(`${action}: could not persist the displayed quote`, error, { quoteId: quote.id });
    return false;
  }
}

/** The list write landed and the card write did not, so the card is behind until a refresh. */
const CARD_BEHIND_MESSAGE = 'Saved, but this tab may show the old quote until you refresh.';

/** A write aimed at one entity: 'gone' is not a failure, and a retry cannot fix it. */
type QuoteWriteOutcome = 'saved' | 'gone' | 'failed';

/**
 * The card renders `currentQuote`, which no observer converges, so a writer that finds the quote
 * gone has to move the card itself.
 *
 * Checked against `written` rather than trusted from the call site: a caller that reaches here
 * with the quote still present would otherwise reroll the card for no reason.
 */
async function refreshCardIfQuoteGone(
  quoteId: string,
  written: Quote[],
  get: () => QuoteStore
): Promise<void> {
  const isGone = !written.some((q) => q.id === quoteId);
  if (isGone && get().currentQuote?.id === quoteId) {
    await get().refreshQuote();
  }
}

/** The locked read no longer holds it: a pull deleted it between the user's click and the write. */
function reportQuoteGone(action: string, quoteId: string): void {
  logger.warn(`${action}: quote ${quoteId} was gone before the write`);
  // Collapsed: AddQuotesToCollectionModal applies its pending changes one quote at a time, so a
  // pull that removed the selection would otherwise stack one identical toast per quote.
  useToastStore.getState().warning('This quote no longer exists', { collapseRepeats: true });
}

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

      // Membership too: nothing clears the stored key, so a quote deleted elsewhere would
      // come back on the next tab.
      let currentQuote = await getCurrentQuote();
      const stored = currentQuote;
      if (!stored || stored.isHidden || !quotes.some((q) => q.id === stored.id)) {
        currentQuote = getRandomQuote(quotes);
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
        // Collapsed: the new-tab interval calls this on every tick, so a persistent failure
        // would otherwise stack one warning per tick.
        if (!(await persistCurrentQuote(newQuote, 'refreshQuote'))) {
          useToastStore.getState().warning(CARD_BEHIND_MESSAGE, { collapseRepeats: true });
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
      // No `error` state: the new-tab interval calls this unprompted, and latching it would
      // replace the card with a load-failure panel for a write the user never asked for.
      // The new-tab interval calls this on every tick, so a persistent failure would otherwise
      // stack one identical toast per tick.
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
      const {
        result,
        quotes: updatedQuotes,
        target,
      } = await persistOneQuote(quoteId, (q) => ({
        ...q,
        isFavorite: !q.isFavorite,
      }));
      assertPersisted(result);
      set({ quotes: updatedQuotes });
      if (target === null) {
        reportQuoteGone('toggleFavorite', quoteId);
        await refreshCardIfQuoteGone(quoteId, updatedQuotes, get);
        return;
      }
      if (syncsLocalEdits(target)) {
        notifyMutated('quotes', quoteId);
      }

      // The persisted value, not a re-toggle of the snapshot: a pull may have flipped the flag.
      const currentQuote = get().currentQuote;
      if (currentQuote && currentQuote.id === quoteId) {
        if (!(await persistCurrentQuote(target, 'toggleFavorite'))) {
          useToastStore.getState().warning(CARD_BEHIND_MESSAGE);
        }
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
      const {
        result,
        quotes: updatedQuotes,
        target,
      } = await persistOneQuote(quoteId, (q) => ({
        ...q,
        isHidden: true,
      }));
      assertPersisted(result);
      set({ quotes: updatedQuotes });
      if (syncsLocalEdits(target)) {
        notifyMutated('quotes', quoteId);
      }
      // No early return: the refresh below is what the user asked for either way.
      if (target === null) {
        reportQuoteGone('hideQuote', quoteId);
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

  incrementViewCount: async (quoteId: string) => {
    try {
      const { result, quotes: updatedQuotes } = await persistOneQuote(quoteId, (q) => ({
        ...q,
        viewCount: q.viewCount + 1,
        lastViewed: new Date().toISOString(),
      }));
      // No toast: background telemetry the user did not initiate. A failed increment is dropped,
      // not retried — the next view counts up from whatever last persisted.
      if (!result.success) {
        logger.error('Could not persist the view count', result.error);
        return;
      }
      set({ quotes: updatedQuotes });
    } catch (error) {
      logger.error('Error incrementing view count', error);
    }
  },

  unhideQuote: async (quoteId: string) => {
    try {
      const {
        result,
        quotes: updatedQuotes,
        target,
      } = await persistOneQuote(quoteId, (q) => ({
        ...q,
        isHidden: false,
      }));
      assertPersisted(result);
      set({ quotes: updatedQuotes });
      if (target === null) {
        reportQuoteGone('unhideQuote', quoteId);
        await refreshCardIfQuoteGone(quoteId, updatedQuotes, get);
        return;
      }
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
      const {
        result,
        quotes: updatedQuotes,
        target,
      } = await persistOneQuote(quoteId, (q) => ({
        ...q,
        ...updates,
      }));
      assertPersisted(result);
      set({ quotes: updatedQuotes });
      if (target === null) {
        reportQuoteGone('editQuote', quoteId);
        await refreshCardIfQuoteGone(quoteId, updatedQuotes, get);
        return 'gone';
      }
      if (syncsLocalEdits(target)) {
        notifyMutated('quotes', quoteId);
      }

      let cardBehind = false;
      const currentQuote = get().currentQuote;
      if (currentQuote && currentQuote.id === quoteId) {
        cardBehind = !(await persistCurrentQuote(target, 'editQuote'));
        set({ currentQuote: target });
      }

      if (cardBehind) {
        useToastStore.getState().warning(CARD_BEHIND_MESSAGE);
      } else {
        useToastStore.getState().success('Quote updated successfully');
      }
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
      assertPersisted(result);
      set({ quotes: updatedQuotes });
      if (syncsLocalEdits(deleted.target)) {
        notifyDeleted('quotes', quoteId);
      }

      // If deleting current quote, get a new one
      const currentQuote = get().currentQuote;
      if (currentQuote && currentQuote.id === quoteId) {
        await get().refreshQuote();
      }

      if (deleted.target === null) {
        reportQuoteGone('deleteQuote', quoteId);
        return;
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

  // Bulk operations
  bulkDelete: async (quoteIds: string[]) => {
    try {
      const { currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      // Collected from the locked read: a pull may have removed some of these, and a tombstone
      // for one this write never deleted is authorship we do not have.
      const deletedCustomIds: string[] = [];
      // Not deletedCustomIds.length: seed quotes are deletable too, they are just not announced.
      let matched = 0;

      const { result, quotes: updatedQuotes } = await updateQuotes((current) => {
        for (const q of current) {
          if (!quoteIdSet.has(q.id)) {
            continue;
          }
          matched += 1;
          if (syncsLocalEdits(q)) {
            deletedCustomIds.push(q.id);
          }
        }
        return current.filter((q) => !quoteIdSet.has(q.id));
      });
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });
      for (const id of deletedCustomIds) {
        notifyDeleted('quotes', id);
      }

      // If current quote was deleted, refresh to a new one
      if (currentQuote && quoteIdSet.has(currentQuote.id)) {
        await get().refreshQuote();
      }

      if (matched === 0) {
        useToastStore.getState().warning('Those quotes no longer exist');
        return true;
      }
      useToastStore.getState().success(`Deleted ${matched} quotes`);
      return true;
    } catch (error) {
      logger.error('Error bulk deleting quotes', error, { quoteIds, count: quoteIds.length });
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, 'Failed to delete quotes. Please try again.'));
      return false;
    }
  },

  bulkToggleFavorite: async (quoteIds: string[], setFavorite: boolean) => {
    try {
      let cardBehind = false;
      const { currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      const affectedCustomIds: string[] = [];
      let matched = 0;

      const { result, quotes: updatedQuotes } = await updateQuotes((current) => {
        for (const q of current) {
          if (!quoteIdSet.has(q.id)) {
            continue;
          }
          matched += 1;
          if (syncsLocalEdits(q)) {
            affectedCustomIds.push(q.id);
          }
        }
        return current.map((q) => (quoteIdSet.has(q.id) ? { ...q, isFavorite: setFavorite } : q));
      });
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });
      notifyMutatedBulk('quotes', affectedCustomIds);

      // The persisted value: a pull may have changed this quote while the write held the lock.
      if (currentQuote && quoteIdSet.has(currentQuote.id)) {
        const persisted = updatedQuotes.find((q) => q.id === currentQuote.id);
        if (persisted) {
          cardBehind = !(await persistCurrentQuote(persisted, 'bulkToggleFavorite'));
          set({ currentQuote: persisted });
        } else {
          await refreshCardIfQuoteGone(currentQuote.id, updatedQuotes, get);
        }
      }

      if (matched === 0) {
        useToastStore.getState().warning('Those quotes no longer exist');
        return true;
      }
      if (cardBehind) {
        useToastStore.getState().warning(CARD_BEHIND_MESSAGE);
        return true;
      }
      const action = setFavorite ? 'added to favorites' : 'removed from favorites';
      useToastStore.getState().success(`${matched} quotes ${action}`);
      return true;
    } catch (error) {
      logger.error('Error bulk toggling favorites', error, {
        quoteIds,
        setFavorite,
        count: quoteIds.length,
      });
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, 'Failed to update favorites. Please try again.'));
      return false;
    }
  },

  bulkToggleHidden: async (quoteIds: string[], setHidden: boolean) => {
    try {
      let cardBehind = false;
      const { currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      const affectedCustomIds: string[] = [];
      let matched = 0;

      const { result, quotes: updatedQuotes } = await updateQuotes((current) => {
        for (const q of current) {
          if (!quoteIdSet.has(q.id)) {
            continue;
          }
          matched += 1;
          if (syncsLocalEdits(q)) {
            affectedCustomIds.push(q.id);
          }
        }
        return current.map((q) => (quoteIdSet.has(q.id) ? { ...q, isHidden: setHidden } : q));
      });
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });
      notifyMutatedBulk('quotes', affectedCustomIds);

      if (currentQuote && quoteIdSet.has(currentQuote.id)) {
        const persisted = updatedQuotes.find((q) => q.id === currentQuote.id);
        if (!persisted) {
          await refreshCardIfQuoteGone(currentQuote.id, updatedQuotes, get);
        } else if (setHidden) {
          await get().refreshQuote();
        } else {
          cardBehind = !(await persistCurrentQuote(persisted, 'bulkToggleHidden'));
          set({ currentQuote: persisted });
        }
      }

      if (matched === 0) {
        useToastStore.getState().warning('Those quotes no longer exist');
        return true;
      }
      if (cardBehind) {
        useToastStore.getState().warning(CARD_BEHIND_MESSAGE);
        return true;
      }
      const action = setHidden ? 'hidden' : 'unhidden';
      useToastStore.getState().success(`${matched} quotes ${action}`);
      return true;
    } catch (error) {
      logger.error('Error bulk toggling hidden', error, {
        quoteIds,
        setHidden,
        count: quoteIds.length,
      });
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, 'Failed to update quotes. Please try again.'));
      return false;
    }
  },

  // Restoration operations
  restoreMissingQuotes: async () => {
    try {
      if (getMissingSeedQuotes(get().quotes).length === 0) {
        useToastStore.getState().info('All default quotes are already present');
        return { restored: 0 };
      }

      // Recomputed against the locked read: a pull may have restored some of them already, and
      // adding those again would duplicate ids.
      let restored = 0;
      const { result, quotes: updatedQuotes } = await updateQuotes((current) => {
        const missing = getMissingSeedQuotes(current);
        restored = missing.length;
        return [...current, ...missing];
      });
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });

      if (restored === 0) {
        useToastStore.getState().info('All default quotes are already present');
        return { restored: 0 };
      }
      useToastStore.getState().success(`Restored ${restored} missing quotes`);
      return { restored };
    } catch (error) {
      logger.error('Error restoring missing quotes', error);
      const errorMessage = 'Failed to restore quotes. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
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

      // Raw: a reset means every stored quote, including one this build cannot parse, and the
      // preserving setter would carry those through.
      const wiped: string[] = [];
      let unusable = 0;
      const tombstones = { complete: true };
      const resetResult = await withCollectionLock('quotes', async () => {
        // Raw, to match the raw write: the validating read drops rows this build cannot parse,
        // and the write destroys them anyway — their ids need tombstones too. Failing to read
        // must not block the reset, which is the escape hatch for unreadable storage.
        try {
          for (const quote of await getQuotesRaw()) {
            // The raw read validates nothing, and an id the server rejects wedges every later
            // push for this device, not just this record.
            if (typeof quote?.id !== 'string' || quote.id === '') {
              unusable += 1;
              continue;
            }
            if (syncsLocalEdits(quote)) {
              wiped.push(quote.id);
            }
          }
        } catch (error) {
          tombstones.complete = false;
          logger.error('Resetting quotes without tombstones: could not read what is stored', error);
        }
        if (unusable > 0) {
          logger.warn(`Reset destroyed ${unusable} stored quotes with no usable id`);
        }
        return setQuotesRaw(freshQuotes);
      });
      assertPersisted(resetResult);
      set({ quotes: freshQuotes, error: null });
      // Without these the reset is local only: every peer still holding these pushes them back.
      for (const id of wiped) {
        notifyDeleted('quotes', id);
      }

      // Reset current quote to a random one
      const newCurrent = getRandomQuote(freshQuotes);
      if (newCurrent) {
        await persistCurrentQuote(newCurrent, 'resetAllQuotes');
        set({
          currentQuote: newCurrent,
          quoteHistory: [newCurrent.id],
          historyIndex: 0,
        });
      }

      if (tombstones.complete) {
        useToastStore.getState().success('All quotes reset to defaults');
      } else {
        useToastStore
          .getState()
          .warning(
            "Quotes reset, but Cuewise couldn't read what it replaced. If you use sync, some may return from your other devices."
          );
      }
    } catch (error) {
      logger.error('Error resetting quotes', error);
      const errorMessage = 'Failed to reset quotes. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      throw error;
    }
  },

  getMissingSeedQuoteCount: () => {
    return getMissingSeedQuotes(get().quotes).length;
  },

  // Collection operations
  createCollection: async (name: string, description?: string) => {
    try {
      const now = new Date().toISOString();

      const newCollection: QuoteCollection = {
        id: generateId(),
        name: name.trim(),
        description: description?.trim(),
        createdAt: now,
      };

      const { result, collections: updatedCollections } = await updateCollections((current) => [
        ...current,
        newCollection,
      ]);
      // setCollections resolves {success:false} on quota rather than throwing, so the catch below
      // never sees it and the collection would look created until the next read.
      if (!result.success) {
        logger.error('Failed to persist the new collection', result.error);
        const errorMessage = 'Failed to create collection. Please try again.';
        useToastStore.getState().error(storageWriteErrorMessage(result.error, errorMessage));
        return false;
      }
      set({ collections: updatedCollections, error: null });
      notifyMutated('collections', newCollection.id);

      useToastStore.getState().success(`Collection "${name}" created`);
      return true;
    } catch (error) {
      logger.error('Error creating collection', error);
      const errorMessage = 'Failed to create collection. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      return false;
    }
  },

  updateCollection: async (id: string, updates) => {
    try {
      const now = new Date().toISOString();
      const applied = { found: false };

      const { result, collections: updatedCollections } = await updateCollections((current) =>
        current.map((c) => {
          if (c.id !== id) {
            return c;
          }
          applied.found = true;
          return { ...c, ...updates, updatedAt: now };
        })
      );
      if (!result.success) {
        logger.error('Failed to persist the collection update', result.error);
        const errorMessage = 'Failed to update collection. Please try again.';
        useToastStore.getState().error(storageWriteErrorMessage(result.error, errorMessage));
        return 'failed';
      }
      // Announcing a write that found nothing marks a gone id dirty, and the next push seals a
      // tombstone this device never authored.
      if (!applied.found) {
        logger.warn(`updateCollection: collection ${id} was gone before the write`);
        useToastStore.getState().warning('This collection no longer exists');
        return 'gone';
      }
      set({ collections: updatedCollections, error: null });
      notifyMutated('collections', id);

      useToastStore.getState().success('Collection updated');
      return 'saved';
    } catch (error) {
      logger.error('Error updating collection', error);
      const errorMessage = 'Failed to update collection. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      return 'failed';
    }
  },

  deleteCollection: async (id: string) => {
    try {
      // Remove collection
      const { result, collections: updatedCollections } = await updateCollections((current) =>
        current.filter((c) => c.id !== id)
      );
      if (!result.success) {
        logger.error('Failed to persist the collection deletion', result.error);
        const errorMessage = 'Failed to delete collection. Please try again.';
        useToastStore.getState().error(storageWriteErrorMessage(result.error, errorMessage));
        return false;
      }
      // Straight after the write, with nothing fallible in between: the steps below can throw, and
      // a tombstone that never pushes lets a peer still holding the collection resurrect it.
      notifyDeleted('collections', id);

      // Remove collection ID from all quotes that had it. Locked and re-read for its own sake:
      // losing this leaves quotes pointing at a collection that no longer exists.
      const unlink = await withCollectionLock<{ quotes: Quote[] | null; unlinked: boolean }>(
        'quotes',
        async () => {
          // Caught here, not by the outer catch: the collection is already deleted and tombstoned
          // by this point, so an unreadable quote read is not a failed delete.
          let current: Quote[];
          try {
            current = await getQuotes();
          } catch (error) {
            logger.error('Deleted the collection but could not read its quotes to unlink', error);
            return { quotes: null, unlinked: false };
          }
          const unlinkedCustomIds: string[] = [];
          const next = current.map((q) => {
            if (q.collectionIds?.includes(id)) {
              if (syncsLocalEdits(q)) {
                unlinkedCustomIds.push(q.id);
              }
              return { ...q, collectionIds: q.collectionIds.filter((cId) => cId !== id) };
            }
            return q;
          });
          const quotesResult = await setQuotes(next);
          if (!quotesResult.success) {
            logger.error(
              'Deleted the collection but could not unlink its quotes',
              quotesResult.error
            );
            return { quotes: current, unlinked: false };
          }
          // Membership lives on the quote, so an unannounced unlink is undone by the next pull.
          notifyMutatedBulk('quotes', unlinkedCustomIds);
          return { quotes: next, unlinked: true };
        }
      );

      // Read at use time: the user can toggle a collection filter while this waits on the locks,
      // and nothing converges this field afterwards.
      const newActiveIds = get().activeCollectionIds.filter((cId) => cId !== id);

      set({
        collections: updatedCollections,
        // Omitted when the read failed: there is no fresher list to commit than what is already here.
        ...(unlink.quotes !== null && { quotes: unlink.quotes }),
        activeCollectionIds: newActiveIds,
        error: null,
      });

      // Persist updated filter settings (collection removed from active filters)
      await persistFilterSettings(get());

      if (!unlink.unlinked) {
        useToastStore.getState().warning('Collection deleted, but its quotes still reference it');
        return true;
      }
      useToastStore.getState().success('Collection deleted');
      return true;
    } catch (error) {
      logger.error('Error deleting collection', error);
      const errorMessage = 'Failed to delete collection. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      return false;
    }
  },

  addQuoteToCollection: async (quoteId: string, collectionId: string) => {
    try {
      let cardBehind = false;
      const { currentQuote } = get();
      // Decided against the locked read: a pull may have added this membership already, and
      // announcing a write that changed nothing marks the quote dirty for no reason.
      const changed = { added: false };

      const {
        result,
        quotes: updatedQuotes,
        target,
      } = await persistOneQuote(quoteId, (q) => {
        const currentIds = q.collectionIds ?? [];
        if (currentIds.includes(collectionId)) {
          return q;
        }
        changed.added = true;
        return { ...q, collectionIds: [...currentIds, collectionId] };
      });
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });
      if (target === null) {
        reportQuoteGone('addQuoteToCollection', quoteId);
        await refreshCardIfQuoteGone(quoteId, updatedQuotes, get);
        return 'gone';
      }
      if (changed.added && syncsLocalEdits(target)) {
        notifyMutated('quotes', quoteId);
      }

      // Update current quote if it was the one modified
      if (currentQuote && currentQuote.id === quoteId) {
        const updatedCurrentQuote = updatedQuotes.find((q) => q.id === quoteId);
        if (updatedCurrentQuote) {
          cardBehind = !(await persistCurrentQuote(updatedCurrentQuote, 'addQuoteToCollection'));
          set({ currentQuote: updatedCurrentQuote });
        }
      }

      if (cardBehind) {
        useToastStore.getState().warning(CARD_BEHIND_MESSAGE);
      }
      return 'saved';
    } catch (error) {
      logger.error('Error adding quote to collection', error);
      const errorMessage = 'Failed to add quote to collection. Please try again.';
      // Collapsed for the same reason as reportQuoteGone: the modal applies one quote at a time,
      // and a full disk fails every one of them.
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, errorMessage), { collapseRepeats: true });
      return 'failed';
    }
  },

  removeQuoteFromCollection: async (quoteId: string, collectionId: string) => {
    try {
      let cardBehind = false;
      const { currentQuote } = get();
      // Decided against the locked read, for the same reason as addQuoteToCollection.
      const changed = { removed: false };

      const {
        result,
        quotes: updatedQuotes,
        target,
      } = await persistOneQuote(quoteId, (q) => {
        if (!q.collectionIds?.includes(collectionId)) {
          return q;
        }
        changed.removed = true;
        return { ...q, collectionIds: q.collectionIds.filter((cId) => cId !== collectionId) };
      });
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });
      if (target === null) {
        reportQuoteGone('removeQuoteFromCollection', quoteId);
        await refreshCardIfQuoteGone(quoteId, updatedQuotes, get);
        return 'gone';
      }
      if (changed.removed && syncsLocalEdits(target)) {
        notifyMutated('quotes', quoteId);
      }

      // Update current quote if it was the one modified
      if (currentQuote && currentQuote.id === quoteId) {
        const updatedCurrentQuote = updatedQuotes.find((q) => q.id === quoteId);
        if (updatedCurrentQuote) {
          cardBehind = !(await persistCurrentQuote(
            updatedCurrentQuote,
            'removeQuoteFromCollection'
          ));
          set({ currentQuote: updatedCurrentQuote });
        }
      }

      if (cardBehind) {
        useToastStore.getState().warning(CARD_BEHIND_MESSAGE);
      }
      return 'saved';
    } catch (error) {
      logger.error('Error removing quote from collection', error);
      const errorMessage = 'Failed to remove quote from collection. Please try again.';
      useToastStore
        .getState()
        .error(storageWriteErrorMessage(error, errorMessage), { collapseRepeats: true });
      return 'failed';
    }
  },

  addQuotesToCollection: async (quoteIds: string[], collectionId: string) => {
    try {
      const { collections, currentQuote } = get();
      const quoteIdSet = new Set(quoteIds);
      // Only the ones this write actually moved: membership lives on the quote itself.
      const affectedCustomIds: string[] = [];
      // Separately from `added`: zero of both is a pull deleting them, zero added alone is
      // membership they already had.
      let matched = 0;
      let added = 0;

      const { result, quotes: updatedQuotes } = await updateQuotes((current) =>
        current.map((q) => {
          if (!quoteIdSet.has(q.id)) {
            return q;
          }
          matched += 1;
          const currentIds = q.collectionIds ?? [];
          if (currentIds.includes(collectionId)) {
            return q;
          }
          added += 1;
          if (syncsLocalEdits(q)) {
            affectedCustomIds.push(q.id);
          }
          return { ...q, collectionIds: [...currentIds, collectionId] };
        })
      );
      assertPersisted(result);
      set({ quotes: updatedQuotes, error: null });
      notifyMutatedBulk('quotes', affectedCustomIds);

      const collection = collections.find((c) => c.id === collectionId);
      const collectionName = collection?.name ?? 'collection';
      if (currentQuote && quoteIdSet.has(currentQuote.id)) {
        await refreshCardIfQuoteGone(currentQuote.id, updatedQuotes, get);
      }

      if (matched === 0) {
        // True, like bulkDelete: nothing landed, but nothing is retryable either.
        useToastStore.getState().warning('Those quotes no longer exist');
        return true;
      }
      if (added === 0) {
        useToastStore.getState().info(`Those quotes are already in "${collectionName}"`);
        return true;
      }
      useToastStore.getState().success(`${added} quotes added to "${collectionName}"`);

      return true;
    } catch (error) {
      logger.error('Error adding quotes to collection', error);
      const errorMessage = 'Failed to add quotes to collection. Please try again.';
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
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
      const { result: writeResult, quotes: updatedQuotes } = await updateQuotes((current) => [
        ...current,
        ...newQuotes,
      ]);
      assertPersisted(writeResult);
      set({ quotes: updatedQuotes, error: null });
      notifyMutatedBulk(
        'quotes',
        newQuotes.map((quote) => quote.id)
      );

      result.success = true;
      result.imported = newQuotes.length;

      const collectionText = collectionId ? ' and added to collection' : '';
      useToastStore.getState().success(`Imported ${newQuotes.length} quotes${collectionText}`);

      return result;
    } catch (error) {
      logger.error('Error bulk adding quotes', error);
      const errorMessage = 'Failed to import quotes. Please try again.';
      result.errors.push(errorMessage);
      useToastStore.getState().error(storageWriteErrorMessage(error, errorMessage));
      return result;
    }
  },
}));
