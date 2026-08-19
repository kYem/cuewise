import {
  ALL_QUOTE_CATEGORIES,
  configurePlatform,
  logger,
  type Quote,
  type QuoteCollection,
  resetPlatform,
  type Settings,
  type SyncMutationSink,
} from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { quoteFactory } from '@cuewise/test-utils/factories';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { SEED_QUOTES } from '../data/seed-quotes';
import {
  createAtBeginningState,
  createAtEndState,
  createCategoryFavoritesScenario,
  createDeletedQuoteScenario,
  createFavoritesScenario,
  createForwardHistoryClearScenario,
  createHiddenQuoteScenario,
  createNavigationQuotes,
  createSyncSink,
  EMPTY_STORE_STATE,
  expectHistoryStructure,
  expectNavigationToQuote,
  expectViewCountIncremented,
} from './__fixtures__/quote-store.fixtures';
import { fakeObservableStore } from './__fixtures__/storage-changes.fixtures';
import { useQuoteStore } from './quote-store';

/** The load's reconcile re-reads, so the read has to answer what the load just wrote. */
function readsBackWrites(): void {
  vi.mocked(storage.setQuotes).mockImplementation(async (quotes) => {
    vi.mocked(storage.getQuotes).mockResolvedValue(quotes);
    return { success: true };
  });
}

// Mock storage functions
const { onLockGranted, heldLocks } = vi.hoisted(() => ({
  onLockGranted: new Map<string, () => void>(),
  heldLocks: new Set<string>(),
}));

vi.mock('@cuewise/storage', () => ({
  getQuotes: vi.fn(),
  getQuotesRaw: vi.fn(),
  setQuotes: vi.fn(),
  setQuotesRaw: vi.fn(),
  getCurrentQuote: vi.fn(),
  setCurrentQuote: vi.fn(),
  getCollections: vi.fn(),
  setCollections: vi.fn(),
  getSettings: vi.fn(),
  updateQuotes: vi.fn(async (mutate: (list: Quote[]) => Quote[]) =>
    storage.withCollectionLock('quotes', async () => {
      const quotes = mutate(await storage.getQuotes());
      return { result: await storage.setQuotes(quotes), quotes };
    })
  ),
  // Routed through the mocked withCollectionLock, exactly as the real one is: a writer that
  // reimplements read-merge-write inline would otherwise be indistinguishable here.
  updateCollections: vi.fn(async (mutate: (list: QuoteCollection[]) => QuoteCollection[]) =>
    storage.withCollectionLock('collections', async () => {
      const collections = mutate(await storage.getCollections());
      return { result: await storage.setCollections(collections), collections };
    })
  ),
  // Fires whatever a test registered for this name at the instant the lock is granted, so a read
  // hoisted out of the section observes the pre-race value and is observably wrong.
  withCollectionLock: vi.fn(<T>(lock: string, apply: () => Promise<T>) => {
    heldLocks.add(lock);
    onLockGranted.get(lock)?.();
    return apply().finally(() => heldLocks.delete(lock));
  }),
}));

// Mock the settings store — filter persistence routes through its serialized updateSettings.
const settingsMock = vi.hoisted(() => ({ updateSettings: vi.fn() }));

vi.mock('./settings-store', () => ({
  useSettingsStore: {
    getState: () => ({ updateSettings: settingsMock.updateSettings }),
  },
}));

// Mock toast store with all methods
const mockToastError = vi.fn();
const mockToastWarning = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastInfo = vi.fn();

vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: mockToastError,
      warning: mockToastWarning,
      success: mockToastSuccess,
      info: mockToastInfo,
    }),
  },
}));

describe('Quote Store', () => {
  beforeEach(() => {
    // Reset store to initial state using fixture
    useQuoteStore.setState(EMPTY_STORE_STATE);

    // Clear all mocks
    vi.clearAllMocks();
    mockToastError.mockClear();
    mockToastWarning.mockClear();
    mockToastSuccess.mockClear();

    // Default mock for collections (empty by default)
    vi.mocked(storage.getCollections).mockResolvedValue([]);

    // The store is a cache of storage, equal to it after every action — which is what lets a test
    // seed with setState and still exercise the read-inside-the-write.
    vi.mocked(storage.getQuotes).mockImplementation(async () => useQuoteStore.getState().quotes);
    vi.mocked(storage.getQuotesRaw).mockImplementation(async () => useQuoteStore.getState().quotes);
    // Default mock for settings
    vi.mocked(storage.getSettings).mockResolvedValue(defaultSettings);
    settingsMock.updateSettings.mockResolvedValue(true);
    vi.mocked(storage.setQuotes).mockResolvedValue({ success: true });
    vi.mocked(storage.setCurrentQuote).mockResolvedValue({ success: true });
  });

  describe('initialize', () => {
    it('should load quotes from storage and set current quote', async () => {
      const mockQuotes = quoteFactory.buildList(5);
      const mockCurrentQuote = mockQuotes[0];

      vi.mocked(storage.getQuotes).mockResolvedValue(mockQuotes);
      vi.mocked(storage.getCurrentQuote).mockResolvedValue(mockCurrentQuote);
      readsBackWrites();

      await useQuoteStore.getState().initialize();

      const state = useQuoteStore.getState();
      expect(state.quotes).toHaveLength(5);
      expect(state.currentQuote?.id).toBe(mockCurrentQuote.id);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(null);
      // View count should have been incremented for current quote
      const currentQuoteInStore = state.quotes.find((q) => q.id === mockCurrentQuote.id);
      expect(currentQuoteInStore?.viewCount).toBe(1);
    });

    it('should seed quotes when storage is empty', async () => {
      vi.mocked(storage.getQuotes).mockResolvedValue([]);
      vi.mocked(storage.getCurrentQuote).mockResolvedValue(null);
      readsBackWrites();

      await useQuoteStore.getState().initialize();

      expect(storage.setQuotes).toHaveBeenCalledWith(SEED_QUOTES);
      const state = useQuoteStore.getState();
      expect(state.quotes).toHaveLength(SEED_QUOTES.length);
      // Should have incremented view count for the selected quote
      expect(state.quotes.some((q) => q.viewCount > 0)).toBe(true);
    });

    it('should select random quote if no current quote exists', async () => {
      const mockQuotes = quoteFactory.buildList(5);

      vi.mocked(storage.getQuotes).mockResolvedValue(mockQuotes);
      vi.mocked(storage.getCurrentQuote).mockResolvedValue(null);

      await useQuoteStore.getState().initialize();

      expect(storage.setCurrentQuote).toHaveBeenCalled();
      const state = useQuoteStore.getState();
      expect(state.currentQuote).toBeTruthy();
    });

    it('should handle errors and set error state', async () => {
      vi.mocked(storage.getQuotes).mockRejectedValue(new Error('Storage error'));

      await useQuoteStore.getState().initialize();

      const state = useQuoteStore.getState();
      expect(state.error).toBeTruthy();
      expect(state.isLoading).toBe(false);
    });

    // Seeding rewrites both quote keys, so a read that failed must never reach it — the write
    // would erase every custom quote the user wrote.
    it('does not seed on a read that failed', async () => {
      vi.mocked(storage.getQuotes).mockRejectedValue(new Error('Storage error'));

      await useQuoteStore.getState().initialize();

      expect(storage.setQuotes).not.toHaveBeenCalled();
    });
  });

  describe('toggleFavorite', () => {
    it('should toggle favorite status of a quote', async () => {
      const mockQuotes = quoteFactory.buildList(3);
      const targetQuote = mockQuotes[0];

      useQuoteStore.setState({ quotes: mockQuotes });

      await useQuoteStore.getState().toggleFavorite(targetQuote.id);

      expect(storage.setQuotes).toHaveBeenCalled();
      const updatedQuotes = vi.mocked(storage.setQuotes).mock.calls[0][0];
      const updatedQuote = updatedQuotes.find((q) => q.id === targetQuote.id);
      expect(updatedQuote?.isFavorite).toBe(!targetQuote.isFavorite);
    });

    it('should update current quote if it is being favorited', async () => {
      const mockQuotes = quoteFactory.buildList(3);
      const currentQuote = mockQuotes[0];

      useQuoteStore.setState({
        quotes: mockQuotes,
        currentQuote,
      });

      await useQuoteStore.getState().toggleFavorite(currentQuote.id);

      expect(storage.setCurrentQuote).toHaveBeenCalled();
      const state = useQuoteStore.getState();
      expect(state.currentQuote?.isFavorite).toBe(!currentQuote.isFavorite);
    });
  });

  describe('addCustomQuote', () => {
    it('should add a new custom quote', async () => {
      const mockQuotes = quoteFactory.buildList(2);
      useQuoteStore.setState({ quotes: mockQuotes });

      const newQuoteData = {
        text: 'Custom quote text',
        author: 'Custom Author',
        category: 'inspiration' as const,
        source: 'Test source',
        notes: 'Test notes',
      };

      await useQuoteStore
        .getState()
        .addCustomQuote(
          newQuoteData.text,
          newQuoteData.author,
          newQuoteData.category,
          newQuoteData.source,
          newQuoteData.notes
        );

      expect(storage.setQuotes).toHaveBeenCalled();
      const updatedQuotes = vi.mocked(storage.setQuotes).mock.calls[0][0];
      expect(updatedQuotes).toHaveLength(3);

      const addedQuote = updatedQuotes[2];
      expect(addedQuote.text).toBe(newQuoteData.text);
      expect(addedQuote.author).toBe(newQuoteData.author);
      expect(addedQuote.category).toBe(newQuoteData.category);
      expect(addedQuote.isCustom).toBe(true);
      expect(addedQuote.isFavorite).toBe(false);
      expect(addedQuote.isHidden).toBe(false);
    });
  });

  describe('hideQuote', () => {
    it('should mark quote as hidden', async () => {
      const mockQuotes = quoteFactory.buildList(3);
      const targetQuote = mockQuotes[1];

      useQuoteStore.setState({ quotes: mockQuotes });

      await useQuoteStore.getState().hideQuote(targetQuote.id);

      expect(storage.setQuotes).toHaveBeenCalled();
      const updatedQuotes = vi.mocked(storage.setQuotes).mock.calls[0][0];
      const hiddenQuote = updatedQuotes.find((q) => q.id === targetQuote.id);
      expect(hiddenQuote?.isHidden).toBe(true);
    });

    it('should refresh quote if hiding current quote', async () => {
      const mockQuotes = quoteFactory.buildList(3);
      const currentQuote = mockQuotes[0];

      useQuoteStore.setState({
        quotes: mockQuotes,
        currentQuote,
      });

      vi.mocked(storage.getCurrentQuote).mockResolvedValue(mockQuotes[1]);

      await useQuoteStore.getState().hideQuote(currentQuote.id);

      // Should call setCurrentQuote due to refreshQuote
      expect(storage.setCurrentQuote).toHaveBeenCalled();
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count and update lastViewed', async () => {
      const mockQuotes = quoteFactory.buildList(3);
      const targetQuote = mockQuotes[0];

      useQuoteStore.setState({ quotes: mockQuotes });

      await useQuoteStore.getState().incrementViewCount(targetQuote.id);

      expect(storage.setQuotes).toHaveBeenCalled();
      const updatedQuotes = vi.mocked(storage.setQuotes).mock.calls[0][0];
      const updatedQuote = updatedQuotes.find((q) => q.id === targetQuote.id);
      expect(updatedQuote?.viewCount).toBe(targetQuote.viewCount + 1);
      expect(updatedQuote?.lastViewed).toBeTruthy();
    });
  });

  describe('refreshQuote', () => {
    it('should select and set a new random quote', async () => {
      const mockQuotes = quoteFactory.buildList(5);
      const currentQuote = mockQuotes[0];

      useQuoteStore.setState({
        quotes: mockQuotes,
        currentQuote,
      });

      await useQuoteStore.getState().refreshQuote();

      expect(storage.setCurrentQuote).toHaveBeenCalled();
      const state = useQuoteStore.getState();
      // Should have a current quote (may or may not be different due to randomness)
      expect(state.currentQuote).toBeTruthy();
    });

    it('should clear a latched error once a refresh succeeds', async () => {
      const mockQuotes = quoteFactory.buildList(5);
      useQuoteStore.setState({ quotes: mockQuotes, error: 'Failed to refresh quote.' });

      await useQuoteStore.getState().refreshQuote();

      expect(useQuoteStore.getState().error).toBeNull();
    });

    it('should keep a load error when no quote can be produced', async () => {
      // Producing nothing is not success: clearing here would swap the error screen,
      // whose retry runs initialize, for "No quotes available", whose retry cannot.
      useQuoteStore.setState({ quotes: [], error: 'Failed to load quotes.' });

      await useQuoteStore.getState().refreshQuote();

      expect(useQuoteStore.getState().error).toBe('Failed to load quotes.');
    });

    it('should avoid selecting the same quote consecutively', async () => {
      const mockQuotes = quoteFactory.buildList(5);
      const currentQuote = mockQuotes[0];

      useQuoteStore.setState({
        quotes: mockQuotes,
        currentQuote,
      });

      await useQuoteStore.getState().refreshQuote();

      expect(storage.setCurrentQuote).toHaveBeenCalled();
      const state = useQuoteStore.getState();
      // Should have a different quote (unless only 1 visible quote exists)
      expect(state.currentQuote).toBeTruthy();
    });

    it('should add new quote to history at index 0', async () => {
      const mockQuotes = quoteFactory.buildList(5);
      const currentQuote = mockQuotes[0];

      useQuoteStore.setState({
        quotes: mockQuotes,
        currentQuote,
        quoteHistory: [currentQuote.id],
        historyIndex: 0,
      });

      await useQuoteStore.getState().refreshQuote();

      const state = useQuoteStore.getState();
      expect(state.quoteHistory.length).toBe(2);
      expect(state.historyIndex).toBe(0);
      expect(state.quoteHistory[0]).toBe(state.currentQuote?.id);
    });

    it('should clear forward history when refreshing from a back position', async () => {
      const scenario = createForwardHistoryClearScenario();

      useQuoteStore.setState({
        quotes: scenario.quotes,
        currentQuote: scenario.currentQuote,
        quoteHistory: scenario.initialHistory.map((q) => q.id),
        historyIndex: scenario.historyIndex,
      });

      await useQuoteStore.getState().refreshQuote();

      const state = useQuoteStore.getState();
      // Should have cleared forward history (quote1) and added new quote
      expectHistoryStructure(state, 3, 0);
      expect(state.quoteHistory[1]).toBe(scenario.currentQuote.id);
    });
  });

  describe('Quote Navigation', () => {
    describe('canGoBack', () => {
      it('should return true when there is history to go back to', () => {
        const { quotes, quote1, quote2 } = createNavigationQuotes(2);
        const state = createAtBeginningState(quotes, [quote1, quote2]);

        useQuoteStore.setState(state);

        expect(useQuoteStore.getState().canGoBack()).toBe(true);
      });

      it('should return false when at the end of history', () => {
        const { quotes, quote1, quote2 } = createNavigationQuotes(2);
        const state = createAtEndState(quotes, [quote1, quote2]);

        useQuoteStore.setState(state);

        expect(useQuoteStore.getState().canGoBack()).toBe(false);
      });

      it('should return false when history is empty', () => {
        useQuoteStore.setState(EMPTY_STORE_STATE);

        expect(useQuoteStore.getState().canGoBack()).toBe(false);
      });
    });

    describe('canGoForward', () => {
      it('should return true when not at the most recent position', () => {
        const { quotes, quote1, quote2 } = createNavigationQuotes(2);
        const state = createAtEndState(quotes, [quote1, quote2]);

        useQuoteStore.setState(state);

        expect(useQuoteStore.getState().canGoForward()).toBe(true);
      });

      it('should return false when at the most recent position', () => {
        const { quotes, quote1, quote2 } = createNavigationQuotes(2);
        const state = createAtBeginningState(quotes, [quote1, quote2]);

        useQuoteStore.setState(state);

        expect(useQuoteStore.getState().canGoForward()).toBe(false);
      });
    });

    describe('goBack', () => {
      it('should navigate to previous quote in history', async () => {
        const { quotes, quote1, quote2 } = createNavigationQuotes(2);
        const state = createAtBeginningState(quotes, [quote1, quote2]);

        useQuoteStore.setState(state);

        await useQuoteStore.getState().goBack();

        const newState = useQuoteStore.getState();
        expectNavigationToQuote(newState, quote2, 1);
        expect(storage.setCurrentQuote).toHaveBeenCalledWith(quote2);
      });

      it('should increment view count when going back', async () => {
        const { quotes, quote1, quote2 } = createNavigationQuotes(2);
        const state = createAtBeginningState(quotes, [quote1, quote2]);

        useQuoteStore.setState(state);

        await useQuoteStore.getState().goBack();

        expectViewCountIncremented(vi.mocked(storage.setQuotes), quote2.id, quote2.viewCount);
      });

      it('should do nothing when at the end of history', async () => {
        const { quotes, quote1 } = createNavigationQuotes(2);
        const state = createAtBeginningState(quotes, [quote1]);

        useQuoteStore.setState(state);

        await useQuoteStore.getState().goBack();

        expect(storage.setCurrentQuote).not.toHaveBeenCalled();
        const newState = useQuoteStore.getState();
        expectNavigationToQuote(newState, quote1, 0);
      });

      it('should skip hidden quotes when going back', async () => {
        const scenario = createHiddenQuoteScenario();

        useQuoteStore.setState({
          quotes: scenario.allQuotes,
          currentQuote: scenario.visibleQuotes[0],
          quoteHistory: scenario.history,
          historyIndex: 0,
        });

        await useQuoteStore.getState().goBack();

        const state = useQuoteStore.getState();
        // Should skip hidden quote and go to the second visible quote
        expectNavigationToQuote(state, scenario.visibleQuotes[1], 2);
      });
    });

    describe('goForward', () => {
      it('should navigate to next quote in history', async () => {
        const { quotes, quote1, quote2 } = createNavigationQuotes(2);
        const state = createAtEndState(quotes, [quote1, quote2]);

        useQuoteStore.setState(state);

        await useQuoteStore.getState().goForward();

        const newState = useQuoteStore.getState();
        expectNavigationToQuote(newState, quote1, 0);
        expect(storage.setCurrentQuote).toHaveBeenCalledWith(quote1);
      });

      it('should increment view count when going forward', async () => {
        const { quotes, quote1, quote2 } = createNavigationQuotes(2);
        const state = createAtEndState(quotes, [quote1, quote2]);

        useQuoteStore.setState(state);

        await useQuoteStore.getState().goForward();

        expectViewCountIncremented(vi.mocked(storage.setQuotes), quote1.id, quote1.viewCount);
      });

      it('should do nothing when already at most recent position', async () => {
        const { quotes, quote1 } = createNavigationQuotes(2);
        const state = createAtBeginningState(quotes, [quote1]);

        useQuoteStore.setState(state);

        await useQuoteStore.getState().goForward();

        expect(storage.setCurrentQuote).not.toHaveBeenCalled();
        const newState = useQuoteStore.getState();
        expectNavigationToQuote(newState, quote1, 0);
      });

      it('should skip deleted quotes when going forward', async () => {
        const scenario = createDeletedQuoteScenario();

        useQuoteStore.setState({
          quotes: scenario.existingQuotes,
          currentQuote: scenario.existingQuotes[1],
          quoteHistory: scenario.history,
          historyIndex: 2,
        });

        await useQuoteStore.getState().goForward();

        const state = useQuoteStore.getState();
        // Should skip deleted quote and go to first quote
        expectNavigationToQuote(state, scenario.existingQuotes[0], 0);
      });
    });
  });

  // The preserving setter re-appends every stored quote this build cannot parse, which is
  // right for an edit and wrong for a reset: the one action that should clear everything
  // would leave those rows on disk to reappear under a build that can read them.
  describe('resetAllQuotes', () => {
    beforeEach(() => {
      vi.mocked(storage.setQuotesRaw).mockResolvedValue({ success: true });
      vi.mocked(storage.setCurrentQuote).mockResolvedValue({ success: true });
    });

    it('writes the seed quotes through the raw setter, never the preserving one', async () => {
      await useQuoteStore.getState().resetAllQuotes();

      expect(storage.setQuotesRaw).toHaveBeenCalledTimes(1);
      expect(storage.setQuotes).not.toHaveBeenCalled();
    });

    it('writes exactly the seed set, with view state cleared', async () => {
      await useQuoteStore.getState().resetAllQuotes();

      const written = vi.mocked(storage.setQuotesRaw).mock.calls[0][0];
      expect(written).toHaveLength(SEED_QUOTES.length);
      expect(written.every((q) => q.viewCount === 0 && !q.isFavorite && !q.isHidden)).toBe(true);
    });
  });

  describe('Favorites Filter', () => {
    it('should toggle showFavoritesOnly state', () => {
      useQuoteStore.setState({ showFavoritesOnly: false });
      useQuoteStore.getState().toggleFavoritesOnly();
      expect(useQuoteStore.getState().showFavoritesOnly).toBe(true);

      useQuoteStore.getState().toggleFavoritesOnly();
      expect(useQuoteStore.getState().showFavoritesOnly).toBe(false);
    });

    it('should include favorites when filter enabled', async () => {
      const { state } = createFavoritesScenario({ showFavoritesOnly: true });
      useQuoteStore.setState(state);

      await useQuoteStore.getState().refreshQuote();

      expect(useQuoteStore.getState().currentQuote?.isFavorite).toBe(true);
    });

    it('should return null when no favorites exist and only favorites enabled', async () => {
      const { state } = createFavoritesScenario({ showFavoritesOnly: true, hasFavorites: false });
      useQuoteStore.setState(state);

      await useQuoteStore.getState().refreshQuote();

      expect(useQuoteStore.getState().currentQuote).toBeNull();
    });

    it('should combine with category filter using OR logic', async () => {
      const { quotes, currentQuote } = createCategoryFavoritesScenario();
      useQuoteStore.setState({
        quotes,
        currentQuote,
        quoteHistory: [currentQuote.id],
        historyIndex: 0,
        isLoading: false,
        error: null,
        showFavoritesOnly: true,
        enabledCategories: ['inspiration'],
        showCustomQuotes: true,
      });

      await useQuoteStore.getState().refreshQuote();

      const result = useQuoteStore.getState().currentQuote;
      // With OR logic, result should be either inspiration OR favorite (or both)
      const isInspiration = result?.category === 'inspiration';
      const isFavorite = result?.isFavorite === true;
      expect(isInspiration || isFavorite).toBe(true);
    });
  });

  describe('Filter Persistence', () => {
    // Helper to set up initialize mocks
    const setupInitializeMocks = (
      settings: Partial<Settings>,
      collections: QuoteCollection[] = []
    ) => {
      const mockQuotes = quoteFactory.buildList(3);
      vi.mocked(storage.getQuotes).mockResolvedValue(mockQuotes);
      vi.mocked(storage.getCurrentQuote).mockResolvedValue(mockQuotes[0]);
      vi.mocked(storage.getCollections).mockResolvedValue(collections);
      vi.mocked(storage.getSettings).mockResolvedValue({ ...defaultSettings, ...settings });
    };

    // Helper to set up toggle test state
    const setupToggleState = (state: Record<string, unknown>) => {
      useQuoteStore.setState({ quotes: quoteFactory.buildList(3), isLoading: false, ...state });
    };

    describe('initialize - loading persisted settings', () => {
      it('should load all persisted filter settings', async () => {
        const collections = [
          { id: 'col-1', name: 'C1', createdAt: new Date().toISOString() },
          { id: 'col-2', name: 'C2', createdAt: new Date().toISOString() },
        ];
        setupInitializeMocks(
          {
            quoteFilterEnabledCategories: ['inspiration', 'productivity'],
            quoteFilterShowCustomQuotes: false,
            quoteFilterShowFavoritesOnly: true,
            quoteFilterActiveCollectionIds: ['col-1', 'col-2'],
          },
          collections
        );

        await useQuoteStore.getState().initialize();

        const state = useQuoteStore.getState();
        expect(state.enabledCategories).toEqual(['inspiration', 'productivity']);
        expect(state.showCustomQuotes).toBe(false);
        expect(state.showFavoritesOnly).toBe(true);
        expect(state.activeCollectionIds).toEqual(['col-1', 'col-2']);
      });

      it('should filter out deleted collection IDs on load', async () => {
        const collections = [{ id: 'col-1', name: 'C1', createdAt: new Date().toISOString() }];
        setupInitializeMocks(
          { quoteFilterActiveCollectionIds: ['col-1', 'col-2', 'col-3'] },
          collections
        );

        await useQuoteStore.getState().initialize();

        expect(useQuoteStore.getState().activeCollectionIds).toEqual(['col-1']);
      });

      it('should use default values when settings are null', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        vi.mocked(storage.getQuotes).mockResolvedValue(mockQuotes);
        vi.mocked(storage.getCurrentQuote).mockResolvedValue(mockQuotes[0]);
        vi.mocked(storage.getSettings).mockResolvedValue(null as unknown as Settings);

        await useQuoteStore.getState().initialize();

        const state = useQuoteStore.getState();
        expect(state.enabledCategories).toEqual(ALL_QUOTE_CATEGORIES);
        expect(state.showCustomQuotes).toBe(true);
        expect(state.showFavoritesOnly).toBe(false);
        expect(state.activeCollectionIds).toEqual([]);
      });
    });

    describe('toggle methods - persistence', () => {
      it('should persist when toggling category off', async () => {
        setupToggleState({ enabledCategories: [...ALL_QUOTE_CATEGORIES] });
        await useQuoteStore.getState().toggleCategory('inspiration');
        expect(settingsMock.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterEnabledCategories: expect.not.arrayContaining(['inspiration']),
          })
        );
      });

      it('should persist when toggling category on', async () => {
        setupToggleState({ enabledCategories: ['productivity'] });
        await useQuoteStore.getState().toggleCategory('inspiration');
        expect(settingsMock.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterEnabledCategories: expect.arrayContaining(['productivity', 'inspiration']),
          })
        );
      });

      it('should persist setEnabledCategories', async () => {
        setupToggleState({ enabledCategories: [...ALL_QUOTE_CATEGORIES] });
        await useQuoteStore.getState().setEnabledCategories(['inspiration', 'creativity']);
        expect(settingsMock.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ quoteFilterEnabledCategories: ['inspiration', 'creativity'] })
        );
      });

      it('should persist toggleCustomQuotes', async () => {
        setupToggleState({ showCustomQuotes: true });
        await useQuoteStore.getState().toggleCustomQuotes();
        expect(settingsMock.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ quoteFilterShowCustomQuotes: false })
        );
      });

      it('should persist toggleFavoritesOnly', async () => {
        setupToggleState({ showFavoritesOnly: false });
        await useQuoteStore.getState().toggleFavoritesOnly();
        expect(settingsMock.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ quoteFilterShowFavoritesOnly: true })
        );
      });

      it('should persist toggleCollection on', async () => {
        setupToggleState({ activeCollectionIds: [] });
        await useQuoteStore.getState().toggleCollection('col-1');
        expect(settingsMock.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ quoteFilterActiveCollectionIds: ['col-1'] })
        );
      });

      it('should persist toggleCollection off', async () => {
        setupToggleState({ activeCollectionIds: ['col-1', 'col-2'] });
        await useQuoteStore.getState().toggleCollection('col-1');
        expect(settingsMock.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ quoteFilterActiveCollectionIds: ['col-2'] })
        );
      });

      it('should persist setActiveCollectionIds', async () => {
        setupToggleState({ activeCollectionIds: [] });
        await useQuoteStore.getState().setActiveCollectionIds(['col-1', 'col-2']);
        expect(settingsMock.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ quoteFilterActiveCollectionIds: ['col-1', 'col-2'] })
        );
      });
    });

    describe('deleteCollection - persistence', () => {
      it('should persist updated activeCollectionIds when deleting active collection', async () => {
        const collections = [
          { id: 'col-1', name: 'C1', createdAt: new Date().toISOString() },
          { id: 'col-2', name: 'C2', createdAt: new Date().toISOString() },
        ];
        vi.mocked(storage.setCollections).mockResolvedValue({ success: true });
        useQuoteStore.setState({
          quotes: quoteFactory.buildList(3),
          collections,
          activeCollectionIds: ['col-1', 'col-2'],
          isLoading: false,
        });

        await useQuoteStore.getState().deleteCollection('col-1');

        expect(settingsMock.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({ quoteFilterActiveCollectionIds: ['col-2'] })
        );
      });
    });

    describe('persistFilterSettings - settings store routing', () => {
      it('persists a filter change through the serialized settings writer', async () => {
        setupToggleState({ enabledCategories: [...ALL_QUOTE_CATEGORIES] });

        await useQuoteStore.getState().toggleCategory('inspiration');

        expect(settingsMock.updateSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterEnabledCategories: expect.any(Array),
            quoteFilterShowCustomQuotes: expect.any(Boolean),
            quoteFilterShowFavoritesOnly: expect.any(Boolean),
            quoteFilterActiveCollectionIds: expect.any(Array),
          })
        );
      });

      it('keeps the in-memory filter when the settings write fails', async () => {
        setupToggleState({ enabledCategories: [...ALL_QUOTE_CATEGORIES] });
        settingsMock.updateSettings.mockResolvedValue(false);

        await useQuoteStore.getState().toggleCategory('inspiration');

        expect(useQuoteStore.getState().enabledCategories).not.toContain('inspiration');
      });
    });
  });
});

// Storage holds collections the store has not seen — a pull that landed while this action waited
// on the lock. Every writer must merge into that list, not the one it can see.
afterEach(() => {
  onLockGranted.clear();
  configurePlatform({ syncSink: null });
});

describe('writers read storage, not their own snapshot', () => {
  beforeEach(() => {
    useQuoteStore.setState(EMPTY_STORE_STATE);
    vi.clearAllMocks();
    onLockGranted.clear();
    heldLocks.clear();
    vi.mocked(storage.setCollections).mockResolvedValue({ success: true });
    vi.mocked(storage.setQuotes).mockResolvedValue({ success: true });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    // Its own getters: borrowed from the block above, this reads as green in a full run and
    // fails on a shape error under `-t`, which is how anyone debugging it runs it.
    vi.mocked(storage.getCollections).mockResolvedValue([]);
    vi.mocked(storage.getCurrentQuote).mockResolvedValue(null);
    vi.mocked(storage.setCurrentQuote).mockResolvedValue({ success: true });
  });

  const pulled = (): QuoteCollection => ({
    id: 'pulled',
    name: 'From another device',
    createdAt: new Date().toISOString(),
  });

  // A read hoisted out of the lock sees the pre-race list, so these pin enclosure, not just that
  // the lock was called with the right name.
  it('toggleFavorite reads the quotes after the lock is granted', async () => {
    const mine = quoteFactory.build({ id: 'mine', isFavorite: false });
    const late = quoteFactory.build({ id: 'late' });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    onLockGranted.set('quotes', () => {
      vi.mocked(storage.getQuotes).mockResolvedValue([mine, late]);
    });

    await useQuoteStore.getState().toggleFavorite('mine');

    const written = vi.mocked(storage.setQuotes).mock.calls[0][0];
    expect(written.map((q) => q.id)).toEqual(['mine', 'late']);
    expect(useQuoteStore.getState().quotes.map((q) => q.id)).toEqual(['mine', 'late']);
  });

  it('toggleFavorite writes the quotes inside the lock', async () => {
    const mine = quoteFactory.build({ id: 'mine', isFavorite: false });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    let heldAtWrite = false;
    vi.mocked(storage.setQuotes).mockImplementation(async () => {
      heldAtWrite = heldLocks.has('quotes');
      return { success: true };
    });

    await useQuoteStore.getState().toggleFavorite('mine');

    expect(heldAtWrite).toBe(true);
  });

  // With no quote on the card: hide and delete would otherwise refresh, and the view-count bump
  // that follows takes the lock a second time.
  it.each([
    ['toggleFavorite', () => useQuoteStore.getState().toggleFavorite('mine')],
    ['hideQuote', () => useQuoteStore.getState().hideQuote('mine')],
    ['deleteQuote', () => useQuoteStore.getState().deleteQuote('mine')],
    ['bulkDelete', () => useQuoteStore.getState().bulkDelete(['mine'])],
    ['bulkToggleFavorite', () => useQuoteStore.getState().bulkToggleFavorite(['mine'], true)],
    ['bulkToggleHidden', () => useQuoteStore.getState().bulkToggleHidden(['mine'], true)],
    ['addQuotesToCollection', () => useQuoteStore.getState().addQuotesToCollection(['mine'], 'c1')],
  ])('%s takes the quotes lock exactly once', async (_label, act) => {
    const mine = quoteFactory.build({ id: 'mine', isCustom: true, collectionIds: [] });
    useQuoteStore.setState({ quotes: [mine], currentQuote: null });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    const locksTaken = (): number =>
      vi.mocked(storage.withCollectionLock).mock.calls.filter(([lock]) => lock === 'quotes').length;
    const start = locksTaken();

    await act();

    expect(locksTaken() - start).toBe(1);
  });

  // Marking a gone id dirty seals a tombstone this device never authored.
  it('does not announce a quote the pull deleted before the write', async () => {
    const mine = quoteFactory.build({ id: 'gone', isCustom: true });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    const sink = createSyncSink();
    configurePlatform({ syncSink: sink });

    await useQuoteStore.getState().toggleFavorite('gone');
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    await useQuoteStore.getState().toggleFavorite('gone');

    // The second call proves the silence came from the gone check, not from throwing earlier.
    expect(sink.markMutated.mock.calls).toEqual([['quotes', 'gone']]);
  });

  // EditQuoteModal closes on anything but 'failed' and the row actions have no UI of their own,
  // so the toast is the only signal that a pull removed the quote before the write.
  it.each([
    ['editQuote', () => useQuoteStore.getState().editQuote('gone', { text: 'edited' })],
    ['unhideQuote', () => useQuoteStore.getState().unhideQuote('gone')],
    ['deleteQuote', () => useQuoteStore.getState().deleteQuote('gone')],
    ['toggleFavorite', () => useQuoteStore.getState().toggleFavorite('gone')],
    [
      'removeQuoteFromCollection',
      () => useQuoteStore.getState().removeQuoteFromCollection('gone', 'c1'),
    ],
  ])('%s warns instead of reporting success when the locked read lost the quote', async (_label, act) => {
    useQuoteStore.setState({ quotes: [quoteFactory.build({ id: 'gone', isCustom: true })] });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);

    await act();

    expect(mockToastWarning).toHaveBeenCalledWith('This quote no longer exists', {
      collapseRepeats: true,
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();
    // A gone quote is not a failure, and reporting both would send the user at a retry.
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('addQuoteToCollection reports gone when the locked read lost the quote', async () => {
    useQuoteStore.setState({ quotes: [quoteFactory.build({ id: 'gone', isCustom: true })] });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);

    await expect(useQuoteStore.getState().addQuoteToCollection('gone', 'c1')).resolves.toBe('gone');
    expect(mockToastWarning).toHaveBeenCalledWith('This quote no longer exists', {
      collapseRepeats: true,
    });
  });

  // A tombstone for a delete this write never made outranks every peer still holding the quote.
  it('does not announce a delete the pull already made', async () => {
    useQuoteStore.setState({ quotes: [quoteFactory.build({ id: 'gone', isCustom: true })] });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    const sink = createSyncSink();
    configurePlatform({ syncSink: sink });

    await useQuoteStore.getState().deleteQuote('gone');

    expect(sink.markDeleted).not.toHaveBeenCalled();
  });

  // The list came from storage and the current quote from state; a pull can put them at odds.
  it('persists the current quote from the locked write, not the stale snapshot', async () => {
    const stale = quoteFactory.build({ id: 'q1', isFavorite: false, text: 'stale' });
    const pulled = { ...stale, text: 'pulled by another device' };
    useQuoteStore.setState({ quotes: [stale], currentQuote: stale });
    vi.mocked(storage.getQuotes).mockResolvedValue([pulled]);

    await useQuoteStore.getState().toggleFavorite('q1');

    expect(vi.mocked(storage.setCurrentQuote).mock.calls[0][0]).toMatchObject({
      text: 'pulled by another device',
      isFavorite: true,
    });
  });

  // Seeding over a pull that landed while this waited on the lock wipes every custom quote,
  // which is why the emptiness test is repeated inside it.
  it('initialize does not seed over a pull that landed while it waited for the lock', async () => {
    const pulledQuote = quoteFactory.build({ id: 'pulled', isCustom: true });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    vi.mocked(storage.getCurrentQuote).mockResolvedValue(null);
    vi.mocked(storage.getSettings).mockResolvedValue(defaultSettings);
    onLockGranted.set('quotes', () => {
      vi.mocked(storage.getQuotes).mockResolvedValue([pulledQuote]);
    });

    await useQuoteStore.getState().initialize();

    expect(storage.setQuotes).not.toHaveBeenCalledWith(SEED_QUOTES);
    expect(useQuoteStore.getState().quotes.map((q) => q.id)).toEqual(['pulled']);
  });

  it.each([
    ['hideQuote', (id: string) => useQuoteStore.getState().hideQuote(id), ['mine', 'late']],
    ['unhideQuote', (id: string) => useQuoteStore.getState().unhideQuote(id), ['mine', 'late']],
    ['deleteQuote', (id: string) => useQuoteStore.getState().deleteQuote(id), ['late']],
    [
      'editQuote',
      (id: string) => useQuoteStore.getState().editQuote(id, { text: 'edited' }),
      ['mine', 'late'],
    ],
  ])('%s reads the quotes after the lock is granted', async (_label, act, expected) => {
    const mine = quoteFactory.build({ id: 'mine' });
    const late = quoteFactory.build({ id: 'late' });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    onLockGranted.set('quotes', () => {
      vi.mocked(storage.getQuotes).mockResolvedValue([mine, late]);
    });

    await act('mine');

    const written = vi.mocked(storage.setQuotes).mock.calls[0][0];
    expect(written.map((q) => q.id)).toEqual(expected);
  });

  it.each([
    [
      'toggleFavorite',
      () => useQuoteStore.getState().toggleFavorite('mine'),
      'Failed to update favorite. Please try again.',

      undefined,
    ],
    [
      'hideQuote',
      () => useQuoteStore.getState().hideQuote('mine'),
      'Failed to hide quote. Please try again.',

      undefined,
    ],
    [
      'unhideQuote',
      () => useQuoteStore.getState().unhideQuote('mine'),
      'Failed to unhide quote. Please try again.',

      undefined,
    ],
    [
      'deleteQuote',
      () => useQuoteStore.getState().deleteQuote('mine'),
      'Failed to delete quote. Please try again.',

      undefined,
    ],
    [
      'editQuote',
      () => useQuoteStore.getState().editQuote('mine', { text: 'edited' }),
      'Failed to update quote. Please try again.',

      undefined,
    ],
    [
      'addCustomQuote',
      () => useQuoteStore.getState().addCustomQuote('new', 'Author', 'inspiration'),
      'Failed to add custom quote. Please try again.',

      undefined,
    ],
    [
      'incrementViewCount',
      () => useQuoteStore.getState().incrementViewCount('mine'),
      null,
      undefined,
    ],
    [
      'addQuoteToCollection',
      () => useQuoteStore.getState().addQuoteToCollection('mine', 'c1'),
      'Failed to add quote to collection. Please try again.',
      { collapseRepeats: true },
    ],
    [
      'removeQuoteFromCollection',
      () => useQuoteStore.getState().removeQuoteFromCollection('mine', 'c1'),
      'Failed to remove quote from collection. Please try again.',
      { collapseRepeats: true },
    ],
    [
      'bulkDelete',
      () => useQuoteStore.getState().bulkDelete(['mine']),
      'Failed to delete quotes. Please try again.',

      undefined,
    ],
    [
      'bulkToggleFavorite',
      () => useQuoteStore.getState().bulkToggleFavorite(['mine'], true),
      'Failed to update favorites. Please try again.',

      undefined,
    ],
    [
      'bulkToggleHidden',
      () => useQuoteStore.getState().bulkToggleHidden(['mine'], true),
      'Failed to update quotes. Please try again.',

      undefined,
    ],
    [
      'addQuotesToCollection',
      () => useQuoteStore.getState().addQuotesToCollection(['mine'], 'c1'),
      'Failed to add quotes to collection. Please try again.',

      undefined,
    ],
  ])('%s does not adopt a write that did not persist', async (_label, act, message, options) => {
    const mine = quoteFactory.build({
      id: 'mine',
      isCustom: true,
      isFavorite: false,
      isHidden: false,
      text: 'original',
      viewCount: 0,
      collectionIds: [],
    });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    vi.mocked(storage.setQuotes).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await act();

    // The whole quote, not its id: every mutation but the deletes leaves the id in place.
    expect(useQuoteStore.getState().quotes).toEqual([mine]);
    // Not `error`: QuoteDisplay and QuoteManagementPage both replace the page with a
    // "Failed to load quotes" panel when it is set, and nothing failed to load.
    expect(useQuoteStore.getState().error).toBeNull();
    if (message === null) {
      expect(mockToastError).not.toHaveBeenCalled();
    } else if (options === undefined) {
      expect(mockToastError).toHaveBeenCalledWith(message);
    } else {
      expect(mockToastError).toHaveBeenCalledWith(message, options);
    }
  });

  // A tombstone for one this write never touched is authorship this device does not have.
  type SinkChannel = (sink: ReturnType<typeof createSyncSink>) => Mock;
  const deletedChannel: SinkChannel = (sink) => sink.markDeleted;
  const bulkChannel: SinkChannel = (sink) => sink.markMutatedBulk;

  it.each([
    ['bulkDelete', () => useQuoteStore.getState().bulkDelete(['kept', 'gone']), deletedChannel],
    [
      'bulkToggleFavorite',
      () => useQuoteStore.getState().bulkToggleFavorite(['kept', 'gone'], true),
      bulkChannel,
    ],
    [
      'bulkToggleHidden',
      () => useQuoteStore.getState().bulkToggleHidden(['kept', 'gone'], true),
      bulkChannel,
    ],
    [
      'addQuotesToCollection',
      () => useQuoteStore.getState().addQuotesToCollection(['kept', 'gone'], 'c1'),
      bulkChannel,
    ],
  ])('%s announces only the quotes the locked read still holds', async (_label, act, channel) => {
    const kept = quoteFactory.build({ id: 'kept', isCustom: true, collectionIds: [] });
    const gone = quoteFactory.build({ id: 'gone', isCustom: true, collectionIds: [] });
    useQuoteStore.setState({ quotes: [kept, gone] });
    vi.mocked(storage.getQuotes).mockResolvedValue([kept]);
    const sink = createSyncSink();
    configurePlatform({ syncSink: sink });

    await act();

    // Every channel, not just the expected one: an id leaking through another still seals a
    // tombstone this device never authored.
    const everyId = [sink.markMutated, sink.markDeleted, sink.markMutatedBulk].flatMap((fn) =>
      fn.mock.calls.flat(2)
    );
    expect(everyId).not.toContain('gone');
    expect(channel(sink).mock.calls.flat(2)).toContain('kept');
  });

  it('restoreMissingQuotes re-checks what is missing inside the lock', async () => {
    const seedSample = SEED_QUOTES[0];
    useQuoteStore.setState({ quotes: [] });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    onLockGranted.set('quotes', () => {
      vi.mocked(storage.getQuotes).mockResolvedValue(SEED_QUOTES);
    });

    await useQuoteStore.getState().restoreMissingQuotes();

    const written = vi.mocked(storage.setQuotes).mock.calls[0][0];
    expect(written.filter((q) => q.id === seedSample.id)).toHaveLength(1);
    expect(mockToastInfo).toHaveBeenCalledWith('All default quotes are already present');
  });

  it('resetAllQuotes replaces the list under the lock', async () => {
    let heldAtWrite = false;
    vi.mocked(storage.setQuotesRaw).mockImplementation(async () => {
      heldAtWrite = heldLocks.has('quotes');
      return { success: true };
    });

    await useQuoteStore.getState().resetAllQuotes();

    expect(heldAtWrite).toBe(true);
  });

  // No observer converges currentQuote, so nothing else moves the card off a quote the write
  // found already deleted.
  it.each([
    ['toggleFavorite', () => useQuoteStore.getState().toggleFavorite('gone')],
    ['editQuote', () => useQuoteStore.getState().editQuote('gone', { text: 'x' })],
  ])('%s moves the card off a quote the pull deleted', async (_label, act) => {
    const gone = quoteFactory.build({ id: 'gone', isCustom: true });
    const other = quoteFactory.build({ id: 'other' });
    useQuoteStore.setState({ quotes: [other], currentQuote: gone });
    vi.mocked(storage.getQuotes).mockResolvedValue([other]);

    await act();

    expect(useQuoteStore.getState().currentQuote?.id).toBe('other');
  });

  it('bulkToggleFavorite persists the current quote from the locked write', async () => {
    const stale = quoteFactory.build({ id: 'q1', text: 'stale', isFavorite: false });
    const pulled = { ...stale, text: 'pulled by another device' };
    useQuoteStore.setState({ quotes: [stale], currentQuote: stale });
    vi.mocked(storage.getQuotes).mockResolvedValue([pulled]);

    await useQuoteStore.getState().bulkToggleFavorite(['q1'], true);

    expect(vi.mocked(storage.setCurrentQuote).mock.calls[0][0]).toMatchObject({
      text: 'pulled by another device',
      isFavorite: true,
    });
  });

  // A count is a claim about the user's data, and for a delete it is a claim about destruction.
  it.each([
    ['bulkDelete', () => useQuoteStore.getState().bulkDelete(['kept', 'gone']), 'Deleted 1 quotes'],
    [
      'bulkToggleFavorite',
      () => useQuoteStore.getState().bulkToggleFavorite(['kept', 'gone'], true),
      '1 quotes added to favorites',
    ],
    [
      'bulkToggleHidden',
      () => useQuoteStore.getState().bulkToggleHidden(['kept', 'gone'], true),
      '1 quotes hidden',
    ],
  ])('%s counts what the locked read matched, not what was asked', async (_label, act, message) => {
    const kept = quoteFactory.build({ id: 'kept', isCustom: true });
    useQuoteStore.setState({ quotes: [kept, quoteFactory.build({ id: 'gone', isCustom: true })] });
    vi.mocked(storage.getQuotes).mockResolvedValue([kept]);

    await act();

    expect(mockToastSuccess).toHaveBeenCalledWith(message);
  });

  it('addQuotesToCollection counts only the quotes it moved', async () => {
    const fresh = quoteFactory.build({ id: 'fresh', isCustom: true, collectionIds: [] });
    const already = quoteFactory.build({ id: 'already', isCustom: true, collectionIds: ['c1'] });
    useQuoteStore.setState({
      quotes: [fresh, already],
      collections: [{ id: 'c1', name: 'Mine', createdAt: new Date().toISOString() }],
    });
    vi.mocked(storage.getQuotes).mockResolvedValue([fresh, already]);

    await useQuoteStore.getState().addQuotesToCollection(['fresh', 'already'], 'c1');

    expect(mockToastSuccess).toHaveBeenCalledWith('1 quotes added to "Mine"');
  });

  // The seed is skipped entirely, so a write failure cannot fail a load that had nothing to seed.
  it('initialize does not rewrite the list when a pull beat the seed', async () => {
    const pulledQuote = quoteFactory.build({ id: 'pulled', isCustom: true });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    vi.mocked(storage.getCurrentQuote).mockResolvedValue(null);
    vi.mocked(storage.getSettings).mockResolvedValue(defaultSettings);
    vi.mocked(storage.setQuotes).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });
    onLockGranted.set('quotes', () => {
      vi.mocked(storage.getQuotes).mockResolvedValue([pulledQuote]);
    });

    await useQuoteStore.getState().initialize();

    const seedWrites = vi
      .mocked(storage.setQuotes)
      .mock.calls.filter(([written]) => written.length === SEED_QUOTES.length);
    expect(seedWrites).toHaveLength(0);
    expect(useQuoteStore.getState().error).toBeNull();
    expect(useQuoteStore.getState().quotes.map((q) => q.id)).toEqual(['pulled']);
  });

  // These append rather than map, so a stale read drops every quote a concurrent pull added.
  it.each([
    [
      'addCustomQuote',
      () => useQuoteStore.getState().addCustomQuote('new one', 'Author', 'inspiration'),
    ],
    [
      'bulkAddQuotes',
      () =>
        useQuoteStore
          .getState()
          .bulkAddQuotes([{ text: 'Imported', author: 'Author', category: 'inspiration' }]),
    ],
  ])('%s appends onto the locked read', async (_label, act) => {
    const mine = quoteFactory.build({ id: 'mine' });
    const late = quoteFactory.build({ id: 'late' });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    onLockGranted.set('quotes', () => {
      vi.mocked(storage.getQuotes).mockResolvedValue([mine, late]);
    });

    await act();

    const written = vi.mocked(storage.setQuotes).mock.calls[0][0];
    expect(written.map((q) => q.id)).toContain('late');
  });

  // The most frequent quote write in the app: every new tab, every refresh, every history step.
  it('incrementViewCount reads the quotes after the lock is granted', async () => {
    const mine = quoteFactory.build({ id: 'mine', viewCount: 0 });
    const late = quoteFactory.build({ id: 'late' });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    onLockGranted.set('quotes', () => {
      vi.mocked(storage.getQuotes).mockResolvedValue([mine, late]);
    });

    await useQuoteStore.getState().incrementViewCount('mine');

    const written = vi.mocked(storage.setQuotes).mock.calls[0][0];
    expect(written.map((q) => q.id)).toEqual(['mine', 'late']);
    expect(written.find((q) => q.id === 'mine')?.viewCount).toBe(1);
  });

  it.each([
    ['addQuoteToCollection', () => useQuoteStore.getState().addQuoteToCollection('mine', 'c2')],
    [
      'removeQuoteFromCollection',
      () => useQuoteStore.getState().removeQuoteFromCollection('mine', 'c1'),
    ],
  ])('%s reads the quotes after the lock is granted', async (_label, act) => {
    const mine = quoteFactory.build({ id: 'mine', collectionIds: ['c1'] });
    const late = quoteFactory.build({ id: 'late' });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    onLockGranted.set('quotes', () => {
      vi.mocked(storage.getQuotes).mockResolvedValue([mine, late]);
    });

    await act();

    const written = vi.mocked(storage.setQuotes).mock.calls[0][0];
    expect(written.map((q) => q.id)).toEqual(['mine', 'late']);
  });

  // hideQuote alone does not early-return: the refresh is what the user asked for either way.
  it('hideQuote still moves the card off a quote the pull deleted', async () => {
    const gone = quoteFactory.build({ id: 'gone', isCustom: true });
    const other = quoteFactory.build({ id: 'other' });
    useQuoteStore.setState({ quotes: [other], currentQuote: gone });
    vi.mocked(storage.getQuotes).mockResolvedValue([other]);

    await useQuoteStore.getState().hideQuote('gone');

    expect(mockToastWarning).toHaveBeenCalledWith('This quote no longer exists', {
      collapseRepeats: true,
    });
    expect(useQuoteStore.getState().currentQuote?.id).toBe('other');
  });

  it.each([
    ['unhideQuote', () => useQuoteStore.getState().unhideQuote('gone')],
    ['addQuoteToCollection', () => useQuoteStore.getState().addQuoteToCollection('gone', 'c1')],
    [
      'removeQuoteFromCollection',
      () => useQuoteStore.getState().removeQuoteFromCollection('gone', 'c1'),
    ],
  ])('%s moves the card off a quote the pull deleted', async (_label, act) => {
    const gone = quoteFactory.build({ id: 'gone', isCustom: true });
    const other = quoteFactory.build({ id: 'other' });
    useQuoteStore.setState({ quotes: [other], currentQuote: gone });
    vi.mocked(storage.getQuotes).mockResolvedValue([other]);

    await act();

    expect(useQuoteStore.getState().currentQuote?.id).toBe('other');
  });

  // The bulk form of the gone report the single-quote writers already make.
  it.each([
    ['bulkDelete', () => useQuoteStore.getState().bulkDelete(['gone'])],
    ['bulkToggleFavorite', () => useQuoteStore.getState().bulkToggleFavorite(['gone'], true)],
    ['bulkToggleHidden', () => useQuoteStore.getState().bulkToggleHidden(['gone'], true)],
  ])('%s does not claim a zero-count success', async (_label, act) => {
    useQuoteStore.setState({ quotes: [quoteFactory.build({ id: 'gone', isCustom: true })] });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);

    await act();

    expect(mockToastWarning).toHaveBeenCalledWith('Those quotes no longer exist');
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('addQuotesToCollection says nothing moved when they were already there', async () => {
    const already = quoteFactory.build({ id: 'already', isCustom: true, collectionIds: ['c1'] });
    useQuoteStore.setState({
      quotes: [already],
      collections: [{ id: 'c1', name: 'Mine', createdAt: new Date().toISOString() }],
    });
    vi.mocked(storage.getQuotes).mockResolvedValue([already]);

    await useQuoteStore.getState().addQuotesToCollection(['already'], 'c1');

    expect(mockToastInfo).toHaveBeenCalledWith('Those quotes are already in "Mine"');
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  // refreshCardIfQuoteGone rolls a new quote onto the card; the bulk writers need it too.
  it.each([
    ['bulkToggleFavorite', () => useQuoteStore.getState().bulkToggleFavorite(['gone'], true)],
    ['bulkToggleHidden', () => useQuoteStore.getState().bulkToggleHidden(['gone'], false)],
  ])('%s moves the card off a quote the pull deleted', async (_label, act) => {
    const gone = quoteFactory.build({ id: 'gone', isCustom: true });
    const other = quoteFactory.build({ id: 'other' });
    useQuoteStore.setState({ quotes: [other], currentQuote: gone });
    vi.mocked(storage.getQuotes).mockResolvedValue([other]);

    await act();

    expect(useQuoteStore.getState().currentQuote?.id).toBe('other');
  });

  // Zero added means either outcome, and telling the user the wrong one is worse than silence.
  it('addQuotesToCollection separates a deleted selection from one already in the collection', async () => {
    const gone = quoteFactory.build({ id: 'gone', isCustom: true, collectionIds: [] });
    useQuoteStore.setState({
      quotes: [gone],
      collections: [{ id: 'c1', name: 'Mine', createdAt: new Date().toISOString() }],
    });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);

    // True like bulkDelete: nothing landed, but a retry cannot help either.
    await expect(useQuoteStore.getState().addQuotesToCollection(['gone'], 'c1')).resolves.toBe(
      true
    );
    expect(mockToastWarning).toHaveBeenCalledWith('Those quotes no longer exist');
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  // Nothing clears the stored key, so without this the card comes back on the next tab.
  it('initialize drops a stored current quote the list no longer holds', async () => {
    const live = quoteFactory.build({ id: 'live' });
    const deletedElsewhere = quoteFactory.build({ id: 'deleted', isHidden: false });
    vi.mocked(storage.getQuotes).mockResolvedValue([live]);
    vi.mocked(storage.getCurrentQuote).mockResolvedValue(deletedElsewhere);
    vi.mocked(storage.getSettings).mockResolvedValue(defaultSettings);

    await useQuoteStore.getState().initialize();

    expect(useQuoteStore.getState().currentQuote?.id).toBe('live');
  });

  // The four writers whose failure guard has its own shape, so the shared table misses them.
  it('initialize surfaces a seed write that did not persist', async () => {
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    vi.mocked(storage.getSettings).mockResolvedValue(defaultSettings);
    vi.mocked(storage.setQuotes).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await useQuoteStore.getState().initialize();

    expect(useQuoteStore.getState().error).toBe('Failed to load quotes. Please refresh the page.');
    expect(useQuoteStore.getState().quotes).toEqual([]);
  });

  it('restoreMissingQuotes does not adopt a write that did not persist', async () => {
    useQuoteStore.setState({ quotes: [] });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    vi.mocked(storage.setQuotes).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await expect(useQuoteStore.getState().restoreMissingQuotes()).rejects.toThrow();
    expect(useQuoteStore.getState().quotes).toEqual([]);
    expect(mockToastError).toHaveBeenCalledWith('Failed to restore quotes. Please try again.');
  });

  it('resetAllQuotes does not adopt a write that did not persist', async () => {
    const mine = quoteFactory.build({ id: 'mine', isCustom: true });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.setQuotesRaw).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await expect(useQuoteStore.getState().resetAllQuotes()).rejects.toThrow();
    expect(useQuoteStore.getState().quotes).toEqual([mine]);
    expect(mockToastError).toHaveBeenCalledWith('Failed to reset quotes. Please try again.');
  });

  it('bulkAddQuotes does not adopt a write that did not persist', async () => {
    useQuoteStore.setState({ quotes: [] });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    vi.mocked(storage.setQuotes).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await useQuoteStore
      .getState()
      .bulkAddQuotes([{ text: 'Imported', author: 'Author', category: 'inspiration' }]);

    expect(useQuoteStore.getState().quotes).toEqual([]);
  });

  // The card is only rerolled when the quote is actually gone: unhiding one that survived must
  // leave it on screen.
  it.each([
    ['bulkToggleHidden', () => useQuoteStore.getState().bulkToggleHidden(['shown'], false)],
    ['bulkToggleFavorite', () => useQuoteStore.getState().bulkToggleFavorite(['shown'], true)],
    [
      'addQuotesToCollection',
      () => useQuoteStore.getState().addQuotesToCollection(['shown'], 'c1'),
    ],
  ])('%s leaves the card alone when the quote survived', async (_label, act) => {
    const shown = quoteFactory.build({ id: 'shown', isHidden: true, collectionIds: [] });
    const other = quoteFactory.build({ id: 'other' });
    useQuoteStore.setState({
      quotes: [shown, other],
      currentQuote: shown,
      collections: [{ id: 'c1', name: 'Mine', createdAt: new Date().toISOString() }],
    });
    vi.mocked(storage.getQuotes).mockResolvedValue([shown, other]);

    await act();

    expect(useQuoteStore.getState().currentQuote?.id).toBe('shown');
  });

  it('addQuotesToCollection moves the card off a quote the pull deleted', async () => {
    const gone = quoteFactory.build({ id: 'gone', isCustom: true, collectionIds: [] });
    const other = quoteFactory.build({ id: 'other', collectionIds: [] });
    useQuoteStore.setState({
      quotes: [other],
      currentQuote: gone,
      collections: [{ id: 'c1', name: 'Mine', createdAt: new Date().toISOString() }],
    });
    vi.mocked(storage.getQuotes).mockResolvedValue([other]);

    await useQuoteStore.getState().addQuotesToCollection(['gone', 'other'], 'c1');

    expect(useQuoteStore.getState().currentQuote?.id).toBe('other');
  });

  // The forms and the selection UI act on these, so a failed write must not look like a
  // completed one.
  it.each([
    [
      'addCustomQuote',
      () => useQuoteStore.getState().addCustomQuote('new', 'Author', 'inspiration'),
    ],
    ['bulkDelete', () => useQuoteStore.getState().bulkDelete(['mine'])],
    ['bulkToggleFavorite', () => useQuoteStore.getState().bulkToggleFavorite(['mine'], true)],
    ['bulkToggleHidden', () => useQuoteStore.getState().bulkToggleHidden(['mine'], true)],
  ])('%s reports false when the write did not persist', async (_label, act) => {
    const mine = quoteFactory.build({ id: 'mine', isCustom: true });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    vi.mocked(storage.setQuotes).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await expect(act()).resolves.toBe(false);
  });

  it.each([
    [
      'addCustomQuote',
      () => useQuoteStore.getState().addCustomQuote('new', 'Author', 'inspiration'),
    ],
    ['bulkDelete', () => useQuoteStore.getState().bulkDelete(['mine'])],
    ['bulkToggleFavorite', () => useQuoteStore.getState().bulkToggleFavorite(['mine'], true)],
    ['bulkToggleHidden', () => useQuoteStore.getState().bulkToggleHidden(['mine'], true)],
  ])('%s reports true when the write persisted', async (_label, act) => {
    const mine = quoteFactory.build({ id: 'mine', isCustom: true });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);

    await expect(act()).resolves.toBe(true);
  });

  // The new-tab interval calls refreshQuote unprompted; latching `error` there would replace
  // the card with a load-failure panel for a write the user never asked for.
  it('refreshQuote does not latch the load-error panel', async () => {
    useQuoteStore.setState({ quotes: [quoteFactory.build({ id: 'mine' })], currentQuote: null });
    vi.mocked(storage.setCurrentQuote).mockRejectedValue(new Error('storage gone'));

    await useQuoteStore.getState().refreshQuote();

    expect(useQuoteStore.getState().error).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith(
      'Failed to refresh quote. Please try again.',
      expect.objectContaining({ collapseRepeats: true })
    );
  });

  // A retry cannot clear a full disk, so "please try again" is the one thing not to say.
  it('a quota failure gets actionable copy instead of a retry', async () => {
    const mine = quoteFactory.build({ id: 'mine', isCustom: true });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    vi.mocked(storage.setQuotes).mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'full' },
    });

    await useQuoteStore.getState().toggleFavorite('mine');

    expect(mockToastError).toHaveBeenCalledWith('Storage is full. Free up some space to continue.');
  });

  // Without tombstones the reset is local only: every peer pushes the wiped quotes back.
  it('resetAllQuotes announces the custom quotes it destroys', async () => {
    const mine = quoteFactory.build({ id: 'mine', isCustom: true });
    const seed = quoteFactory.build({ id: 'seed', isCustom: false });
    useQuoteStore.setState({ quotes: [mine, seed] });
    vi.mocked(storage.getQuotesRaw).mockResolvedValue([mine, seed]);
    vi.mocked(storage.setQuotesRaw).mockResolvedValue({ success: true });
    const sink = createSyncSink();
    configurePlatform({ syncSink: sink });

    await useQuoteStore.getState().resetAllQuotes();

    expect(sink.markDeleted).toHaveBeenCalledWith('quotes', 'mine');
    expect(sink.markDeleted).not.toHaveBeenCalledWith('quotes', 'seed');
  });

  it('deleteCollection announces only the custom quotes it unlinked', async () => {
    const mine = { ...pulled(), id: 'c1', name: 'Mine' };
    const member = quoteFactory.build({ id: 'member', isCustom: true, collectionIds: ['c1'] });
    // A seed member: unlinked just the same, but not ours to announce.
    const other = quoteFactory.build({ id: 'other', isCustom: false, collectionIds: ['c1'] });
    useQuoteStore.setState({ collections: [mine], quotes: [member, other] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    vi.mocked(storage.getQuotes).mockResolvedValue([member, other]);
    const sink = createSyncSink();
    configurePlatform({ syncSink: sink });

    await useQuoteStore.getState().deleteCollection('c1');

    expect(sink.markMutatedBulk).toHaveBeenCalledWith('quotes', ['member']);
  });

  it('does not write at all when the locked read no longer holds the quote', async () => {
    useQuoteStore.setState({
      quotes: [quoteFactory.build({ id: 'gone', isCustom: true })],
      currentQuote: null,
    });
    vi.mocked(storage.getQuotes).mockResolvedValue([]);

    await useQuoteStore.getState().toggleFavorite('gone');

    expect(storage.setQuotes).not.toHaveBeenCalled();
    expect(mockToastWarning).toHaveBeenCalledWith('This quote no longer exists', {
      collapseRepeats: true,
    });
  });

  // The reset is the escape hatch for storage this build cannot read, so it must not need
  // that read to succeed.
  it('resetAllQuotes still replaces the list when the stored quotes are unreadable', async () => {
    useQuoteStore.setState({ quotes: [quoteFactory.build({ id: 'mine', isCustom: true })] });
    vi.mocked(storage.getQuotesRaw).mockRejectedValue(new Error('unreadable'));
    vi.mocked(storage.setQuotesRaw).mockResolvedValue({ success: true });

    await useQuoteStore.getState().resetAllQuotes();

    expect(storage.setQuotesRaw).toHaveBeenCalled();
    // Warned, not claimed: with no tombstones the peers push those quotes straight back.
    expect(mockToastWarning).toHaveBeenCalledWith(
      'Quotes reset on this device. They may return from your other devices.'
    );
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  // The modal holds open on 'failed' and closes on 'gone'; one boolean for both left it unable
  // to close while a deleted quote stayed selected.
  it.each([
    ['addQuoteToCollection', () => useQuoteStore.getState().addQuoteToCollection('mine', 'c2')],
    [
      'removeQuoteFromCollection',
      () => useQuoteStore.getState().removeQuoteFromCollection('mine', 'c1'),
    ],
  ])('%s separates a failed write from a deleted quote', async (_label, act) => {
    const mine = quoteFactory.build({ id: 'mine', isCustom: true, collectionIds: ['c1'] });
    useQuoteStore.setState({ quotes: [mine] });
    vi.mocked(storage.getQuotes).mockResolvedValue([mine]);
    vi.mocked(storage.setQuotes).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await expect(act()).resolves.toBe('failed');

    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    await expect(act()).resolves.toBe('gone');
  });

  // The seed set is the largest single write in the store, so it is the likeliest to hit quota.
  it('initialize surfaces a full disk instead of advising a refresh', async () => {
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    vi.mocked(storage.getSettings).mockResolvedValue(defaultSettings);
    vi.mocked(storage.setQuotes).mockResolvedValue({
      success: false,
      error: { type: 'quota_exceeded', message: 'full' },
    });

    await useQuoteStore.getState().initialize();

    const message = 'Storage is full. Free up some space to continue.';
    expect(mockToastError).toHaveBeenCalledWith(message);
    // The panel reads this field, so a different wording there contradicts the toast.
    expect(useQuoteStore.getState().error).toBe(message);
  });

  // An id the server rejects fails the whole push batch, and it never clears — every later
  // push from this device fails on it too.
  it('resetAllQuotes never tombstones an id the raw read cannot vouch for', async () => {
    const usable = quoteFactory.build({ id: 'usable', isCustom: true });
    useQuoteStore.setState({ quotes: [usable] });
    vi.mocked(storage.getQuotesRaw).mockResolvedValue([
      usable,
      { isCustom: true, text: 'no id at all' } as unknown as Quote,
      { id: '', isCustom: true } as unknown as Quote,
    ]);
    vi.mocked(storage.setQuotesRaw).mockResolvedValue({ success: true });
    const sink = createSyncSink();
    configurePlatform({ syncSink: sink });

    await useQuoteStore.getState().resetAllQuotes();

    expect(sink.markDeleted.mock.calls).toEqual([['quotes', 'usable']]);
  });

  it('createCollection reads the collections after the lock is granted', async () => {
    const late = { ...pulled(), id: 'late' };
    useQuoteStore.setState({ collections: [] });
    vi.mocked(storage.getCollections).mockResolvedValue([]);
    onLockGranted.set('collections', () => {
      vi.mocked(storage.getCollections).mockResolvedValue([late]);
    });

    await useQuoteStore.getState().createCollection('Mine');

    const written = vi.mocked(storage.setCollections).mock.calls[0][0];
    expect(written.map((c) => c.id)).toEqual([late.id, expect.any(String)]);
    // Committing a locally-recomputed list instead of what the lock returned would hide the
    // pulled collection until the observer happens to fire.
    expect(useQuoteStore.getState().collections.map((c) => c.id)).toEqual(written.map((c) => c.id));
  });

  it('deleteCollection reads the quotes after the lock is granted', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    useQuoteStore.setState({ collections: [mine] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    vi.mocked(storage.getQuotes).mockResolvedValue([]);
    onLockGranted.set('quotes', () => {
      vi.mocked(storage.getQuotes).mockResolvedValue([
        quoteFactory.build({ id: 'late', collectionIds: ['mine'] }),
      ]);
    });

    await useQuoteStore.getState().deleteCollection('mine');

    const written = vi.mocked(storage.setQuotes).mock.calls[0][0];
    expect(written.map((q) => q.id)).toEqual(['late']);
    expect(written[0].collectionIds).toEqual([]);
    expect(useQuoteStore.getState().quotes.map((q) => q.id)).toEqual(['late']);
  });

  it('updateCollection reads the collections after the lock is granted', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    const late = { ...pulled(), id: 'late' };
    useQuoteStore.setState({ collections: [mine] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    onLockGranted.set('collections', () => {
      vi.mocked(storage.getCollections).mockResolvedValue([mine, late]);
    });

    await useQuoteStore.getState().updateCollection('mine', { name: 'B' });

    const written = vi.mocked(storage.setCollections).mock.calls[0][0];
    expect(written.map((c) => c.id)).toEqual(['mine', 'late']);
    expect(useQuoteStore.getState().collections.map((c) => c.id)).toEqual(['mine', 'late']);
  });

  it('deleteCollection reads the collections after the lock is granted', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    const late = { ...pulled(), id: 'late' };
    useQuoteStore.setState({ collections: [mine] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    onLockGranted.set('collections', () => {
      vi.mocked(storage.getCollections).mockResolvedValue([mine, late]);
    });

    await useQuoteStore.getState().deleteCollection('mine');

    const written = vi.mocked(storage.setCollections).mock.calls[0][0];
    expect(written.map((c) => c.id)).toEqual(['late']);
    expect(useQuoteStore.getState().collections.map((c) => c.id)).toEqual(['late']);
  });

  // The read probes above prove freshness; these prove the write has not slipped out past the
  // lock's release, which leaves the same window open on the other side.
  it('deleteCollection writes the quotes inside the lock', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    useQuoteStore.setState({ collections: [mine] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    vi.mocked(storage.getQuotes).mockResolvedValue([
      quoteFactory.build({ id: 'q1', collectionIds: ['mine'] }),
    ]);
    let heldAtWrite = false;
    vi.mocked(storage.setQuotes).mockImplementation(async () => {
      heldAtWrite = heldLocks.has('quotes');
      return { success: true };
    });

    await useQuoteStore.getState().deleteCollection('mine');

    expect(heldAtWrite).toBe(true);
  });

  it('createCollection writes the collections inside the lock', async () => {
    useQuoteStore.setState({ collections: [] });
    vi.mocked(storage.getCollections).mockResolvedValue([]);
    let heldAtWrite = false;
    vi.mocked(storage.setCollections).mockImplementation(async () => {
      heldAtWrite = heldLocks.has('collections');
      return { success: true };
    });

    await useQuoteStore.getState().createCollection('Mine');

    expect(heldAtWrite).toBe(true);
  });

  // Per writer, not a pooled total: one writer skipping the lock while another takes it twice
  // leaves the total unchanged.
  it('every collection writer goes through the locked helper', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    useQuoteStore.setState({ collections: [mine] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    const locksTaken = (): number =>
      vi.mocked(storage.withCollectionLock).mock.calls.filter(([lock]) => lock === 'collections')
        .length;

    const start = locksTaken();
    await useQuoteStore.getState().createCollection('A');
    const afterCreate = locksTaken();
    await useQuoteStore.getState().updateCollection('mine', { name: 'B' });
    const afterUpdate = locksTaken();
    await useQuoteStore.getState().deleteCollection('mine');

    expect([afterCreate - start, afterUpdate - afterCreate, locksTaken() - afterUpdate]).toEqual([
      1, 1, 1,
    ]);
  });

  it('deleteCollection leaves the quote list alone when it could not be read', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    const held = quoteFactory.build({ id: 'held' });
    useQuoteStore.setState({ collections: [mine], quotes: [held] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    vi.mocked(storage.getQuotes).mockRejectedValue(new Error('unreadable'));

    await useQuoteStore.getState().deleteCollection('mine');

    expect(useQuoteStore.getState().quotes).toEqual([held]);
  });

  it('createCollection keeps a collection only storage knows about', async () => {
    const incoming = pulled();
    useQuoteStore.setState({ collections: [] });
    vi.mocked(storage.getCollections).mockResolvedValue([incoming]);

    await useQuoteStore.getState().createCollection('Mine');

    const written = vi.mocked(storage.setCollections).mock.calls[0][0];
    expect(written.map((c) => c.id)).toEqual([incoming.id, expect.any(String)]);
  });

  it('deleteCollection keeps a collection only storage knows about', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    const incoming = pulled();
    useQuoteStore.setState({ collections: [mine] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine, incoming]);

    await useQuoteStore.getState().deleteCollection('mine');

    const written = vi.mocked(storage.setCollections).mock.calls[0][0];
    expect(written.map((c) => c.id)).toEqual([incoming.id]);
  });

  it('updateCollection reports failure when the pull deleted it', async () => {
    useQuoteStore.setState({ collections: [{ ...pulled(), id: 'gone' }] });
    vi.mocked(storage.getCollections).mockResolvedValue([]);

    await expect(useQuoteStore.getState().updateCollection('gone', { name: 'x' })).resolves.toBe(
      'gone'
    );
    // CollectionForm closes on 'gone', so this warning is how the user learns the rename no-opped.
    expect(mockToastWarning).toHaveBeenCalledWith('This collection no longer exists');
  });

  it('updateCollection reports failure when the write did not persist', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    useQuoteStore.setState({ collections: [mine] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    vi.mocked(storage.setCollections).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await expect(useQuoteStore.getState().updateCollection('mine', { name: 'x' })).resolves.toBe(
      'failed'
    );
    expect(mockToastError).toHaveBeenCalledWith('Failed to update collection. Please try again.');
  });

  it('createCollection reports failure when the write did not persist', async () => {
    useQuoteStore.setState({ collections: [] });
    vi.mocked(storage.getCollections).mockResolvedValue([]);
    vi.mocked(storage.setCollections).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await expect(useQuoteStore.getState().createCollection('Mine')).resolves.toBe(false);
    // CollectionPicker shows nothing of its own on failure, so the toast is the only signal.
    expect(mockToastError).toHaveBeenCalledWith('Failed to create collection. Please try again.');
  });

  // The steps after the collection write can throw; a tombstone that never pushes lets a peer
  // still holding the collection resurrect it.
  it('deleteCollection announces the tombstone even when unlinking blows up', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    useQuoteStore.setState({ collections: [mine] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    vi.mocked(storage.getQuotes).mockRejectedValue(new Error('unreadable'));
    const sink = createSyncSink();
    configurePlatform({ syncSink: sink });

    const ok = await useQuoteStore.getState().deleteCollection('mine');

    expect(sink.markDeleted).toHaveBeenCalledWith('collections', 'mine');
    // The delete landed and pushed; calling it a failure would send the user to retry an
    // irreversible, fleet-wide operation.
    expect(ok).toBe(true);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(useQuoteStore.getState().collections).toEqual([]);
  });

  it('deleteCollection says so when the quotes could not be unlinked', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    useQuoteStore.setState({ collections: [mine] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    vi.mocked(storage.getQuotes).mockResolvedValue([
      quoteFactory.build({ id: 'q1', collectionIds: ['mine'] }),
    ]);
    vi.mocked(storage.setQuotes).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await useQuoteStore.getState().deleteCollection('mine');

    expect(mockToastWarning).toHaveBeenCalledWith(
      'Collection deleted, but its quotes still reference it'
    );
  });

  it('deleteCollection reports failure when the write did not persist', async () => {
    useQuoteStore.setState({ collections: [{ ...pulled(), id: 'mine' }] });
    vi.mocked(storage.getCollections).mockResolvedValue([{ ...pulled(), id: 'mine' }]);
    vi.mocked(storage.setCollections).mockResolvedValue({
      success: false,
      error: { type: 'unknown', message: 'write failed' },
    });

    await expect(useQuoteStore.getState().deleteCollection('mine')).resolves.toBe(false);
    // CollectionList closes its dialog either way, so the toast is the only signal.
    expect(mockToastError).toHaveBeenCalledWith('Failed to delete collection. Please try again.');
  });

  // The user can toggle a filter chip while this waits on the locks, and nothing converges
  // activeCollectionIds afterwards.
  it('deleteCollection drops the filter from the list as it stands after the locks', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    useQuoteStore.setState({ collections: [mine], activeCollectionIds: ['mine', 'other'] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    vi.mocked(storage.getQuotes).mockImplementation(async () => {
      useQuoteStore.setState({ activeCollectionIds: [] });
      return [];
    });

    await useQuoteStore.getState().deleteCollection('mine');

    expect(useQuoteStore.getState().activeCollectionIds).toEqual([]);
  });

  // Losing this unlink leaves quotes pointing at a collection that no longer exists.
  it('deleteCollection unlinks quotes it only sees in storage', async () => {
    const mine = { ...pulled(), id: 'mine', name: 'Mine' };
    useQuoteStore.setState({ collections: [mine], quotes: [] });
    vi.mocked(storage.getCollections).mockResolvedValue([mine]);
    vi.mocked(storage.getQuotes).mockResolvedValue([
      quoteFactory.build({ id: 'q1', collectionIds: ['mine'] }),
    ]);

    await useQuoteStore.getState().deleteCollection('mine');

    const written = vi.mocked(storage.setQuotes).mock.calls[0][0];
    expect(written[0].collectionIds).toEqual([]);
    // The re-read alone is not the fix: unlocked, the pull it re-read past can still land between
    // that read and this write.
    expect(storage.withCollectionLock).toHaveBeenCalledWith('quotes', expect.any(Function));
  });
});

describe('sync sink wiring', () => {
  const markMutated = vi.fn();
  const markDeleted = vi.fn();
  const markMutatedBulk = vi.fn();
  const fakeSink: SyncMutationSink = { markMutated, markDeleted, markMutatedBulk };

  beforeEach(() => {
    useQuoteStore.setState(EMPTY_STORE_STATE);
    vi.clearAllMocks();
    markMutated.mockClear();
    markDeleted.mockClear();
    markMutatedBulk.mockClear();
    // clearAllMocks keeps implementations, so an earlier block's getters would leak in.
    vi.mocked(storage.getCollections).mockImplementation(
      async () => useQuoteStore.getState().collections
    );
    vi.mocked(storage.getQuotes).mockImplementation(async () => useQuoteStore.getState().quotes);
    vi.mocked(storage.getQuotesRaw).mockImplementation(async () => useQuoteStore.getState().quotes);
    vi.mocked(storage.setQuotes).mockResolvedValue({ success: true });
    vi.mocked(storage.setQuotesRaw).mockResolvedValue({ success: true });
    vi.mocked(storage.setCollections).mockResolvedValue({ success: true });
    configurePlatform({ syncSink: fakeSink });
  });

  afterEach(() => {
    configurePlatform({ syncSink: null });
  });

  it('notifies markMutated with the new custom quote id after addCustomQuote persists', async () => {
    useQuoteStore.setState({ quotes: [] });

    await useQuoteStore.getState().addCustomQuote('A quote', 'Author', 'inspiration');

    const created = useQuoteStore.getState().quotes[0];
    expect(markMutated).toHaveBeenCalledWith('quotes', created.id);
  });

  it('notifies markDeleted with the quote id after deleteQuote persists a custom quote', async () => {
    const customQuote = quoteFactory.build({ isCustom: true });
    useQuoteStore.setState({ quotes: [customQuote] });

    await useQuoteStore.getState().deleteQuote(customQuote.id);

    expect(markDeleted).toHaveBeenCalledWith('quotes', customQuote.id);
  });

  it('does not notify when toggling favorite on a seed (non-custom) quote', async () => {
    const seedQuote = quoteFactory.build({ isCustom: false });
    useQuoteStore.setState({ quotes: [seedQuote] });

    await useQuoteStore.getState().toggleFavorite(seedQuote.id);

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifies markMutated when toggling favorite on a custom quote', async () => {
    const customQuote = quoteFactory.build({ isCustom: true });
    useQuoteStore.setState({ quotes: [customQuote] });

    await useQuoteStore.getState().toggleFavorite(customQuote.id);

    expect(markMutated).toHaveBeenCalledWith('quotes', customQuote.id);
  });

  it('notifies markMutated with the new collection id after createCollection persists', async () => {
    vi.mocked(storage.setCollections).mockResolvedValue({ success: true });
    useQuoteStore.setState({ collections: [] });

    await useQuoteStore.getState().createCollection('My collection');

    const created = useQuoteStore.getState().collections[0];
    expect(markMutated).toHaveBeenCalledWith('collections', created.id);
  });

  // The guard exists for exactly this: a gone id marked dirty seals a tombstone on the next push
  // that this device never authored, and other devices apply it as a delete.
  it('does not mark a collection dirty when the pull deleted it before the write', async () => {
    vi.mocked(storage.setCollections).mockResolvedValue({ success: true });
    useQuoteStore.setState({
      collections: [{ id: 'gone', name: 'Gone', createdAt: new Date().toISOString() }],
    });
    vi.mocked(storage.getCollections).mockResolvedValue([]);

    await useQuoteStore.getState().updateCollection('gone', { name: 'Renamed' });

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifies markMutated after updateCollection persists a rename', async () => {
    vi.mocked(storage.setCollections).mockResolvedValue({ success: true });
    useQuoteStore.setState({
      collections: [{ id: 'c1', name: 'Before', createdAt: new Date().toISOString() }],
    });

    const outcome = await useQuoteStore.getState().updateCollection('c1', { name: 'After' });

    expect(outcome).toBe('saved');
    expect(useQuoteStore.getState().collections[0].name).toBe('After');
    expect(markMutated).toHaveBeenCalledWith('collections', 'c1');
  });

  it('notifies markMutated when hiding a custom quote', async () => {
    const customQuote = quoteFactory.build({ isCustom: true, isHidden: false });
    useQuoteStore.setState({ quotes: [customQuote], currentQuote: null });

    await useQuoteStore.getState().hideQuote(customQuote.id);

    expect(markMutated).toHaveBeenCalledWith('quotes', customQuote.id);
  });

  it('does not notify when hiding a seed (non-custom) quote', async () => {
    const seedQuote = quoteFactory.build({ isCustom: false, isHidden: false });
    useQuoteStore.setState({ quotes: [seedQuote], currentQuote: null });

    await useQuoteStore.getState().hideQuote(seedQuote.id);

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifies markMutated when unhiding a custom quote', async () => {
    const customQuote = quoteFactory.build({ isCustom: true, isHidden: true });
    useQuoteStore.setState({ quotes: [customQuote] });

    await useQuoteStore.getState().unhideQuote(customQuote.id);

    expect(markMutated).toHaveBeenCalledWith('quotes', customQuote.id);
  });

  it('does not notify when unhiding a seed (non-custom) quote', async () => {
    const seedQuote = quoteFactory.build({ isCustom: false, isHidden: true });
    useQuoteStore.setState({ quotes: [seedQuote] });

    await useQuoteStore.getState().unhideQuote(seedQuote.id);

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifies markMutated with the quote id after addQuoteToCollection persists a custom quote', async () => {
    const customQuote = quoteFactory.build({ isCustom: true, collectionIds: [] });
    useQuoteStore.setState({ quotes: [customQuote], currentQuote: null });

    await useQuoteStore.getState().addQuoteToCollection(customQuote.id, 'collection-1');

    expect(markMutated).toHaveBeenCalledWith('quotes', customQuote.id);
  });

  it('does not notify addQuoteToCollection for a seed (non-custom) quote', async () => {
    const seedQuote = quoteFactory.build({ isCustom: false, collectionIds: [] });
    useQuoteStore.setState({ quotes: [seedQuote], currentQuote: null });

    await useQuoteStore.getState().addQuoteToCollection(seedQuote.id, 'collection-1');

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifies markMutated with the quote id after removeQuoteFromCollection persists a custom quote', async () => {
    const customQuote = quoteFactory.build({ isCustom: true, collectionIds: ['collection-1'] });
    useQuoteStore.setState({ quotes: [customQuote], currentQuote: null });

    await useQuoteStore.getState().removeQuoteFromCollection(customQuote.id, 'collection-1');

    expect(markMutated).toHaveBeenCalledWith('quotes', customQuote.id);
  });

  it('does not notify removeQuoteFromCollection for a seed (non-custom) quote', async () => {
    const seedQuote = quoteFactory.build({ isCustom: false, collectionIds: ['collection-1'] });
    useQuoteStore.setState({ quotes: [seedQuote], currentQuote: null });

    await useQuoteStore.getState().removeQuoteFromCollection(seedQuote.id, 'collection-1');

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifies markMutatedBulk with only the custom ids after bulkToggleFavorite', async () => {
    const customA = quoteFactory.build({ isCustom: true, isFavorite: false });
    const customB = quoteFactory.build({ isCustom: true, isFavorite: false });
    const seed = quoteFactory.build({ isCustom: false, isFavorite: false });
    useQuoteStore.setState({ quotes: [customA, customB, seed], currentQuote: null });

    await useQuoteStore.getState().bulkToggleFavorite([customA.id, customB.id, seed.id], true);

    expect(markMutatedBulk).toHaveBeenCalledWith('quotes', [customA.id, customB.id]);
    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifies markMutatedBulk with only the custom ids after bulkToggleHidden', async () => {
    const customA = quoteFactory.build({ isCustom: true, isHidden: false });
    const customB = quoteFactory.build({ isCustom: true, isHidden: false });
    const seed = quoteFactory.build({ isCustom: false, isHidden: false });
    useQuoteStore.setState({ quotes: [customA, customB, seed], currentQuote: null });

    await useQuoteStore.getState().bulkToggleHidden([customA.id, customB.id, seed.id], true);

    expect(markMutatedBulk).toHaveBeenCalledWith('quotes', [customA.id, customB.id]);
    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifies markMutatedBulk with only the custom ids after addQuotesToCollection', async () => {
    const customA = quoteFactory.build({ isCustom: true, collectionIds: [] });
    const customB = quoteFactory.build({ isCustom: true, collectionIds: [] });
    const seed = quoteFactory.build({ isCustom: false, collectionIds: [] });
    useQuoteStore.setState({
      quotes: [customA, customB, seed],
      collections: [],
      currentQuote: null,
    });

    await useQuoteStore
      .getState()
      .addQuotesToCollection([customA.id, customB.id, seed.id], 'collection-1');

    expect(markMutatedBulk).toHaveBeenCalledWith('quotes', [customA.id, customB.id]);
    expect(markMutated).not.toHaveBeenCalled();
  });

  it('filters an already-member custom quote out of addQuotesToCollection notifications', async () => {
    const alreadyMember = quoteFactory.build({ isCustom: true, collectionIds: ['collection-1'] });
    const newMember = quoteFactory.build({ isCustom: true, collectionIds: [] });
    useQuoteStore.setState({
      quotes: [alreadyMember, newMember],
      collections: [],
      currentQuote: null,
    });

    await useQuoteStore
      .getState()
      .addQuotesToCollection([alreadyMember.id, newMember.id], 'collection-1');

    expect(markMutatedBulk).toHaveBeenCalledWith('quotes', [newMember.id]);
  });

  it('notifies markMutatedBulk with every imported id after bulkAddQuotes', async () => {
    useQuoteStore.setState({ quotes: [] });

    await useQuoteStore.getState().bulkAddQuotes([
      { text: 'Quote A', author: 'Author A', category: 'inspiration' },
      { text: 'Quote B', author: 'Author B', category: 'inspiration' },
    ]);

    const created = useQuoteStore.getState().quotes;
    expect(markMutatedBulk).toHaveBeenCalledWith(
      'quotes',
      created.map((q) => q.id)
    );
    expect(markMutated).not.toHaveBeenCalled();
  });
});

describe('converging on quotes written elsewhere', () => {
  const markMutated = vi.fn();
  const markMutatedBulk = vi.fn();
  const markDeleted = vi.fn();
  const fakeSink: SyncMutationSink = { markMutated, markMutatedBulk, markDeleted };

  const mine = quoteFactory.build({ text: 'mine' });
  const theirs = quoteFactory.build({ text: 'pulled from the other device' });

  async function initializeObserving(): Promise<ReturnType<typeof fakeObservableStore>> {
    const fake = fakeObservableStore();
    configurePlatform({ storage: fake.store, syncSink: fakeSink });
    // A fresh array per read, as a real parse gives. The guard compares by value, but the test
    // below asserts reference identity, and one shared array satisfies that with or without it.
    vi.mocked(storage.getQuotes).mockImplementation(async () => [mine]);
    vi.mocked(storage.getCollections).mockImplementation(async () => []);
    vi.mocked(storage.getCurrentQuote).mockResolvedValue(mine);
    await useQuoteStore.getState().initialize();
    return fake;
  }

  beforeEach(() => {
    markMutated.mockClear();
    markMutatedBulk.mockClear();
    markDeleted.mockClear();
    // vitest's restoreMocks resets spies, not vi.fn()s — a leftover warn would satisfy the next
    // test's waitFor before it has done anything.
    mockToastWarning.mockClear();
    mockToastError.mockClear();
    // Its own setters: borrowed from the describe above, this block reads as green in a full run
    // and fails every write under `-t`, which is how anyone debugging it runs it.
    vi.mocked(storage.setQuotes).mockResolvedValue({ success: true });
    vi.mocked(storage.setQuotesRaw).mockResolvedValue({ success: true });
    vi.mocked(storage.setCollections).mockResolvedValue({ success: true });
    vi.mocked(storage.setCurrentQuote).mockResolvedValue({ success: true });
  });

  // Not just the sink: the observer is module-scoped, so a fake left registered keeps it
  // subscribed to a dead backend for any describe added after this one.
  afterEach(() => {
    resetPlatform();
  });

  it('adopts a quote the sync engine wrote straight to storage', async () => {
    const fake = await initializeObserving();
    vi.mocked(storage.getQuotes).mockResolvedValue([mine, theirs]);

    fake.emit(['customQuotes']);

    await vi.waitFor(() =>
      expect(useQuoteStore.getState().quotes.map((quote) => quote.text)).toEqual([
        'mine',
        'pulled from the other device',
      ])
    );
  });

  it('adopts a collection written under its own key', async () => {
    const fake = await initializeObserving();
    const collection: QuoteCollection = { id: 'c1', name: 'Pulled', createdAt: '2026-08-03' };
    vi.mocked(storage.getCollections).mockResolvedValue([collection]);

    fake.emit(['collections']);

    await vi.waitFor(() =>
      expect(useQuoteStore.getState().collections.map((each) => each.name)).toEqual(['Pulled'])
    );
  });

  it('does not report a pulled change back to the sync engine', async () => {
    const fake = await initializeObserving();
    vi.mocked(storage.getQuotes).mockResolvedValue([mine, theirs]);

    fake.emit(['customQuotes']);

    await vi.waitFor(() => expect(useQuoteStore.getState().quotes).toHaveLength(2));
    expect(markMutated).not.toHaveBeenCalled();
    expect(markMutatedBulk).not.toHaveBeenCalled();
    expect(markDeleted).not.toHaveBeenCalled();
  });

  it('keeps the pulled quote when the next local write rewrites the whole list', async () => {
    const fake = await initializeObserving();
    vi.mocked(storage.getQuotes).mockResolvedValue([mine, theirs]);
    fake.emit(['customQuotes']);
    await vi.waitFor(() => expect(useQuoteStore.getState().quotes).toHaveLength(2));

    await useQuoteStore.getState().toggleFavorite(mine.id);

    const persisted = vi.mocked(storage.setQuotes).mock.lastCall?.[0] ?? [];
    expect(persisted.map((quote) => quote.text)).toContain('pulled from the other device');
    // The argument alone passes even when the write failed and the store kept the old list.
    expect(useQuoteStore.getState().quotes.map((quote) => quote.text)).toContain(
      'pulled from the other device'
    );
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('leaves the in-memory list alone when its own write is announced back', async () => {
    const fake = await initializeObserving();
    const before = useQuoteStore.getState().quotes;
    const readsAfterInit = vi.mocked(storage.getQuotes).mock.calls.length;

    fake.emit(['customQuotes']);

    await vi.waitFor(() =>
      expect(vi.mocked(storage.getQuotes).mock.calls.length).toBeGreaterThan(readsAfterInit)
    );
    expect(useQuoteStore.getState().quotes).toBe(before);
  });

  it('keeps the list it has when the re-read fails, and warns the view is stale', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const fake = await initializeObserving();
    const before = useQuoteStore.getState().quotes;
    vi.mocked(storage.getQuotes).mockRejectedValue(
      new Error('Could not read the stored customQuotes list')
    );

    fake.emit(['customQuotes']);

    await vi.waitFor(() =>
      expect(mockToastWarning).toHaveBeenCalledWith(expect.stringContaining('your quotes'))
    );
    expect(useQuoteStore.getState().quotes).toBe(before);
    expect(useQuoteStore.getState().error).toBeNull();
  });

  // The collections read must reject out of the refresh too — degrading it to [] is what would
  // make the next createCollection persist a one-element array over the rest.
  it('keeps its collections when only the collections read fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const fake = await initializeObserving();
    const before = useQuoteStore.getState().collections;
    vi.mocked(storage.getCollections).mockRejectedValue(
      new Error('Could not read the stored collections list')
    );

    fake.emit(['collections']);

    await vi.waitFor(() =>
      expect(mockToastWarning).toHaveBeenCalledWith(expect.stringContaining('your quotes'))
    );
    expect(useQuoteStore.getState().collections).toBe(before);
  });

  it('leaves the displayed quote alone', async () => {
    const fake = await initializeObserving();
    const displayed = useQuoteStore.getState().currentQuote;
    vi.mocked(storage.getQuotes).mockResolvedValue([mine, theirs]);

    fake.emit(['customQuotes']);

    await vi.waitFor(() => expect(useQuoteStore.getState().quotes).toHaveLength(2));
    expect(useQuoteStore.getState().currentQuote).toBe(displayed);
  });
});
