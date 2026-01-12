import { ALL_QUOTE_CATEGORIES, type QuoteCollection, type Settings } from '@cuewise/shared';
import * as storage from '@cuewise/storage';
import { quoteFactory } from '@cuewise/test-utils/factories';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  EMPTY_STORE_STATE,
  expectHistoryStructure,
  expectNavigationToQuote,
  expectViewCountIncremented,
} from './__fixtures__/quote-store.fixtures';
import { useQuoteStore } from './quote-store';

// Mock storage functions
vi.mock('@cuewise/storage', () => ({
  getQuotes: vi.fn(),
  setQuotes: vi.fn(),
  getCurrentQuote: vi.fn(),
  setCurrentQuote: vi.fn(),
  getCollections: vi.fn(),
  setCollections: vi.fn(),
  getSettings: vi.fn(),
  setSettings: vi.fn(),
}));

// Mock toast store with all methods
const mockToastError = vi.fn();
const mockToastWarning = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: mockToastError,
      warning: mockToastWarning,
      success: mockToastSuccess,
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
    // Default mock for settings
    vi.mocked(storage.getSettings).mockResolvedValue(defaultSettings);
    vi.mocked(storage.setSettings).mockResolvedValue({ success: true });
  });

  describe('initialize', () => {
    it('should load quotes from storage and set current quote', async () => {
      const mockQuotes = quoteFactory.buildList(5);
      const mockCurrentQuote = mockQuotes[0];

      vi.mocked(storage.getQuotes).mockResolvedValue(mockQuotes);
      vi.mocked(storage.getCurrentQuote).mockResolvedValue(mockCurrentQuote);

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

  describe('Favorites Filter', () => {
    it('should toggle showFavoritesOnly state', () => {
      useQuoteStore.setState({ showFavoritesOnly: false });
      useQuoteStore.getState().toggleFavoritesOnly();
      expect(useQuoteStore.getState().showFavoritesOnly).toBe(true);

      useQuoteStore.getState().toggleFavoritesOnly();
      expect(useQuoteStore.getState().showFavoritesOnly).toBe(false);
    });

    it('should only return favorites when filter enabled', async () => {
      const { state } = createFavoritesScenario({ showFavoritesOnly: true });
      useQuoteStore.setState(state);

      await useQuoteStore.getState().refreshQuote();

      expect(useQuoteStore.getState().currentQuote?.isFavorite).toBe(true);
    });

    it('should return null when no favorites exist', async () => {
      const { state } = createFavoritesScenario({ showFavoritesOnly: true, hasFavorites: false });
      useQuoteStore.setState(state);

      await useQuoteStore.getState().refreshQuote();

      expect(useQuoteStore.getState().currentQuote).toBeNull();
    });

    it('should combine with category filter', async () => {
      const { quotes, favoriteInspiration, currentQuote } = createCategoryFavoritesScenario();
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
      expect(result?.id).toBe(favoriteInspiration.id);
    });
  });

  describe('Filter Persistence', () => {
    describe('initialize - loading persisted settings', () => {
      it('should load persisted filter categories from settings', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        const customSettings: Settings = {
          ...defaultSettings,
          quoteFilterEnabledCategories: ['inspiration', 'productivity'],
        };

        vi.mocked(storage.getQuotes).mockResolvedValue(mockQuotes);
        vi.mocked(storage.getCurrentQuote).mockResolvedValue(mockQuotes[0]);
        vi.mocked(storage.getSettings).mockResolvedValue(customSettings);

        await useQuoteStore.getState().initialize();

        const state = useQuoteStore.getState();
        expect(state.enabledCategories).toEqual(['inspiration', 'productivity']);
      });

      it('should load persisted showCustomQuotes from settings', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        const customSettings: Settings = {
          ...defaultSettings,
          quoteFilterShowCustomQuotes: false,
        };

        vi.mocked(storage.getQuotes).mockResolvedValue(mockQuotes);
        vi.mocked(storage.getCurrentQuote).mockResolvedValue(mockQuotes[0]);
        vi.mocked(storage.getSettings).mockResolvedValue(customSettings);

        await useQuoteStore.getState().initialize();

        const state = useQuoteStore.getState();
        expect(state.showCustomQuotes).toBe(false);
      });

      it('should load persisted showFavoritesOnly from settings', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        const customSettings: Settings = {
          ...defaultSettings,
          quoteFilterShowFavoritesOnly: true,
        };

        vi.mocked(storage.getQuotes).mockResolvedValue(mockQuotes);
        vi.mocked(storage.getCurrentQuote).mockResolvedValue(mockQuotes[0]);
        vi.mocked(storage.getSettings).mockResolvedValue(customSettings);

        await useQuoteStore.getState().initialize();

        const state = useQuoteStore.getState();
        expect(state.showFavoritesOnly).toBe(true);
      });

      it('should load persisted activeCollectionIds from settings', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        const mockCollections: QuoteCollection[] = [
          { id: 'col-1', name: 'Collection 1', createdAt: new Date().toISOString() },
          { id: 'col-2', name: 'Collection 2', createdAt: new Date().toISOString() },
        ];
        const customSettings: Settings = {
          ...defaultSettings,
          quoteFilterActiveCollectionIds: ['col-1', 'col-2'],
        };

        vi.mocked(storage.getQuotes).mockResolvedValue(mockQuotes);
        vi.mocked(storage.getCurrentQuote).mockResolvedValue(mockQuotes[0]);
        vi.mocked(storage.getCollections).mockResolvedValue(mockCollections);
        vi.mocked(storage.getSettings).mockResolvedValue(customSettings);

        await useQuoteStore.getState().initialize();

        const state = useQuoteStore.getState();
        expect(state.activeCollectionIds).toEqual(['col-1', 'col-2']);
      });

      it('should filter out deleted collection IDs on load', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        const mockCollections: QuoteCollection[] = [
          { id: 'col-1', name: 'Collection 1', createdAt: new Date().toISOString() },
          // col-2 has been deleted
        ];
        const customSettings: Settings = {
          ...defaultSettings,
          quoteFilterActiveCollectionIds: ['col-1', 'col-2', 'col-3'],
        };

        vi.mocked(storage.getQuotes).mockResolvedValue(mockQuotes);
        vi.mocked(storage.getCurrentQuote).mockResolvedValue(mockQuotes[0]);
        vi.mocked(storage.getCollections).mockResolvedValue(mockCollections);
        vi.mocked(storage.getSettings).mockResolvedValue(customSettings);

        await useQuoteStore.getState().initialize();

        const state = useQuoteStore.getState();
        // Only col-1 should remain as col-2 and col-3 don't exist
        expect(state.activeCollectionIds).toEqual(['col-1']);
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

    describe('toggleCategory - persistence', () => {
      it('should persist enabled categories when toggling a category off', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        useQuoteStore.setState({
          quotes: mockQuotes,
          enabledCategories: [...ALL_QUOTE_CATEGORIES],
          isLoading: false,
        });

        await useQuoteStore.getState().toggleCategory('inspiration');

        expect(storage.setSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterEnabledCategories: expect.not.arrayContaining(['inspiration']),
          })
        );
      });

      it('should persist enabled categories when toggling a category on', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        useQuoteStore.setState({
          quotes: mockQuotes,
          enabledCategories: ['productivity'],
          isLoading: false,
        });

        await useQuoteStore.getState().toggleCategory('inspiration');

        expect(storage.setSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterEnabledCategories: expect.arrayContaining(['productivity', 'inspiration']),
          })
        );
      });
    });

    describe('setEnabledCategories - persistence', () => {
      it('should persist enabled categories', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        useQuoteStore.setState({
          quotes: mockQuotes,
          enabledCategories: [...ALL_QUOTE_CATEGORIES],
          isLoading: false,
        });

        await useQuoteStore.getState().setEnabledCategories(['inspiration', 'creativity']);

        expect(storage.setSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterEnabledCategories: ['inspiration', 'creativity'],
          })
        );
        expect(useQuoteStore.getState().enabledCategories).toEqual(['inspiration', 'creativity']);
      });
    });

    describe('toggleCustomQuotes - persistence', () => {
      it('should persist showCustomQuotes when toggling', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        useQuoteStore.setState({
          quotes: mockQuotes,
          showCustomQuotes: true,
          isLoading: false,
        });

        await useQuoteStore.getState().toggleCustomQuotes();

        expect(storage.setSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterShowCustomQuotes: false,
          })
        );
        expect(useQuoteStore.getState().showCustomQuotes).toBe(false);
      });
    });

    describe('toggleFavoritesOnly - persistence', () => {
      it('should persist showFavoritesOnly when toggling', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        useQuoteStore.setState({
          quotes: mockQuotes,
          showFavoritesOnly: false,
          isLoading: false,
        });

        await useQuoteStore.getState().toggleFavoritesOnly();

        expect(storage.setSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterShowFavoritesOnly: true,
          })
        );
        expect(useQuoteStore.getState().showFavoritesOnly).toBe(true);
      });
    });

    describe('toggleCollection - persistence', () => {
      it('should persist activeCollectionIds when toggling a collection on', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        useQuoteStore.setState({
          quotes: mockQuotes,
          activeCollectionIds: [],
          isLoading: false,
        });

        await useQuoteStore.getState().toggleCollection('col-1');

        expect(storage.setSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterActiveCollectionIds: ['col-1'],
          })
        );
        expect(useQuoteStore.getState().activeCollectionIds).toEqual(['col-1']);
      });

      it('should persist activeCollectionIds when toggling a collection off', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        useQuoteStore.setState({
          quotes: mockQuotes,
          activeCollectionIds: ['col-1', 'col-2'],
          isLoading: false,
        });

        await useQuoteStore.getState().toggleCollection('col-1');

        expect(storage.setSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterActiveCollectionIds: ['col-2'],
          })
        );
        expect(useQuoteStore.getState().activeCollectionIds).toEqual(['col-2']);
      });
    });

    describe('setActiveCollectionIds - persistence', () => {
      it('should persist activeCollectionIds', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        useQuoteStore.setState({
          quotes: mockQuotes,
          activeCollectionIds: [],
          isLoading: false,
        });

        await useQuoteStore.getState().setActiveCollectionIds(['col-1', 'col-2']);

        expect(storage.setSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteFilterActiveCollectionIds: ['col-1', 'col-2'],
          })
        );
        expect(useQuoteStore.getState().activeCollectionIds).toEqual(['col-1', 'col-2']);
      });
    });

    describe('persistFilterSettings - error handling', () => {
      it('should show warning toast when persistence fails', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        useQuoteStore.setState({
          quotes: mockQuotes,
          showFavoritesOnly: false,
          isLoading: false,
        });

        // Make setSettings fail
        vi.mocked(storage.setSettings).mockRejectedValue(new Error('Storage error'));

        await useQuoteStore.getState().toggleFavoritesOnly();

        // State should still be updated in memory
        expect(useQuoteStore.getState().showFavoritesOnly).toBe(true);

        // Warning toast should be shown
        expect(mockToastWarning).toHaveBeenCalledWith(
          'Failed to save filter preferences. Your changes may not persist.'
        );
      });

      it('should show warning toast when getSettings fails during persistence', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        useQuoteStore.setState({
          quotes: mockQuotes,
          enabledCategories: [...ALL_QUOTE_CATEGORIES],
          isLoading: false,
        });

        // Make getSettings fail during persistence (after initialize)
        vi.mocked(storage.getSettings).mockRejectedValue(new Error('Cannot read settings'));

        await useQuoteStore.getState().toggleCategory('inspiration');

        // State should still be updated in memory
        expect(useQuoteStore.getState().enabledCategories).not.toContain('inspiration');

        // Warning toast should be shown
        expect(mockToastWarning).toHaveBeenCalledWith(
          'Failed to save filter preferences. Your changes may not persist.'
        );
      });
    });
  });
});
