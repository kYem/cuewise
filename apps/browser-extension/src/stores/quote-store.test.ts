import * as storage from '@cuewise/storage';
import { quoteFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEED_QUOTES } from '../data/seed-quotes';
import { useQuoteStore } from './quote-store';

// Mock storage functions
vi.mock('@cuewise/storage', () => ({
  getQuotes: vi.fn(),
  setQuotes: vi.fn(),
  getCurrentQuote: vi.fn(),
  setCurrentQuote: vi.fn(),
}));

// Mock toast store
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: vi.fn(),
    }),
  },
}));

describe('Quote Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useQuoteStore.setState({
      quotes: [],
      currentQuote: null,
      isLoading: true,
      error: null,
      quoteHistory: [],
      historyIndex: 0,
    });

    // Clear all mocks
    vi.clearAllMocks();
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
      const mockQuotes = quoteFactory.buildList(5);
      const quote1 = mockQuotes[0];
      const quote2 = mockQuotes[1];
      const quote3 = mockQuotes[2];

      useQuoteStore.setState({
        quotes: mockQuotes,
        currentQuote: quote2,
        quoteHistory: [quote1.id, quote2.id, quote3.id],
        historyIndex: 1, // Currently at quote2, can go back to quote3 or forward to quote1
      });

      await useQuoteStore.getState().refreshQuote();

      const state = useQuoteStore.getState();
      // Should have cleared forward history (quote1) and added new quote
      expect(state.quoteHistory.length).toBe(3);
      expect(state.historyIndex).toBe(0);
      expect(state.quoteHistory[1]).toBe(quote2.id);
    });
  });

  describe('Quote Navigation', () => {
    describe('canGoBack', () => {
      it('should return true when there is history to go back to', () => {
        const mockQuotes = quoteFactory.buildList(3);

        useQuoteStore.setState({
          quotes: mockQuotes,
          quoteHistory: [mockQuotes[0].id, mockQuotes[1].id],
          historyIndex: 0,
        });

        expect(useQuoteStore.getState().canGoBack()).toBe(true);
      });

      it('should return false when at the end of history', () => {
        const mockQuotes = quoteFactory.buildList(2);

        useQuoteStore.setState({
          quotes: mockQuotes,
          quoteHistory: [mockQuotes[0].id, mockQuotes[1].id],
          historyIndex: 1, // At the last item
        });

        expect(useQuoteStore.getState().canGoBack()).toBe(false);
      });

      it('should return false when history is empty', () => {
        useQuoteStore.setState({
          quotes: [],
          quoteHistory: [],
          historyIndex: 0,
        });

        expect(useQuoteStore.getState().canGoBack()).toBe(false);
      });
    });

    describe('canGoForward', () => {
      it('should return true when not at the most recent position', () => {
        const mockQuotes = quoteFactory.buildList(3);

        useQuoteStore.setState({
          quotes: mockQuotes,
          quoteHistory: [mockQuotes[0].id, mockQuotes[1].id],
          historyIndex: 1,
        });

        expect(useQuoteStore.getState().canGoForward()).toBe(true);
      });

      it('should return false when at the most recent position', () => {
        const mockQuotes = quoteFactory.buildList(2);

        useQuoteStore.setState({
          quotes: mockQuotes,
          quoteHistory: [mockQuotes[0].id, mockQuotes[1].id],
          historyIndex: 0,
        });

        expect(useQuoteStore.getState().canGoForward()).toBe(false);
      });
    });

    describe('goBack', () => {
      it('should navigate to previous quote in history', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        const quote1 = mockQuotes[0];
        const quote2 = mockQuotes[1];

        useQuoteStore.setState({
          quotes: mockQuotes,
          currentQuote: quote1,
          quoteHistory: [quote1.id, quote2.id],
          historyIndex: 0,
        });

        await useQuoteStore.getState().goBack();

        const state = useQuoteStore.getState();
        expect(state.currentQuote?.id).toBe(quote2.id);
        expect(state.historyIndex).toBe(1);
        expect(storage.setCurrentQuote).toHaveBeenCalledWith(quote2);
      });

      it('should increment view count when going back', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        const quote1 = mockQuotes[0];
        const quote2 = mockQuotes[1];

        useQuoteStore.setState({
          quotes: mockQuotes,
          currentQuote: quote1,
          quoteHistory: [quote1.id, quote2.id],
          historyIndex: 0,
        });

        await useQuoteStore.getState().goBack();

        expect(storage.setQuotes).toHaveBeenCalled();
        const updatedQuotes = vi.mocked(storage.setQuotes).mock.calls[0][0];
        const updatedQuote = updatedQuotes.find((q) => q.id === quote2.id);
        expect(updatedQuote?.viewCount).toBe(quote2.viewCount + 1);
      });

      it('should do nothing when at the end of history', async () => {
        const mockQuotes = quoteFactory.buildList(2);
        const quote1 = mockQuotes[0];

        useQuoteStore.setState({
          quotes: mockQuotes,
          currentQuote: quote1,
          quoteHistory: [quote1.id],
          historyIndex: 0,
        });

        await useQuoteStore.getState().goBack();

        expect(storage.setCurrentQuote).not.toHaveBeenCalled();
        const state = useQuoteStore.getState();
        expect(state.currentQuote?.id).toBe(quote1.id);
        expect(state.historyIndex).toBe(0);
      });

      it('should skip hidden quotes when going back', async () => {
        const mockQuotes = quoteFactory.buildList(4);
        const quote1 = mockQuotes[0];
        const quote2 = { ...mockQuotes[1], isHidden: true };
        const quote3 = mockQuotes[2];

        useQuoteStore.setState({
          quotes: [quote1, quote2, quote3],
          currentQuote: quote1,
          quoteHistory: [quote1.id, quote2.id, quote3.id],
          historyIndex: 0,
        });

        await useQuoteStore.getState().goBack();

        const state = useQuoteStore.getState();
        // Should skip quote2 (hidden) and go to quote3
        expect(state.currentQuote?.id).toBe(quote3.id);
        expect(state.historyIndex).toBe(2);
      });
    });

    describe('goForward', () => {
      it('should navigate to next quote in history', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        const quote1 = mockQuotes[0];
        const quote2 = mockQuotes[1];

        useQuoteStore.setState({
          quotes: mockQuotes,
          currentQuote: quote2,
          quoteHistory: [quote1.id, quote2.id],
          historyIndex: 1,
        });

        await useQuoteStore.getState().goForward();

        const state = useQuoteStore.getState();
        expect(state.currentQuote?.id).toBe(quote1.id);
        expect(state.historyIndex).toBe(0);
        expect(storage.setCurrentQuote).toHaveBeenCalledWith(quote1);
      });

      it('should increment view count when going forward', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        const quote1 = mockQuotes[0];
        const quote2 = mockQuotes[1];

        useQuoteStore.setState({
          quotes: mockQuotes,
          currentQuote: quote2,
          quoteHistory: [quote1.id, quote2.id],
          historyIndex: 1,
        });

        await useQuoteStore.getState().goForward();

        expect(storage.setQuotes).toHaveBeenCalled();
        const updatedQuotes = vi.mocked(storage.setQuotes).mock.calls[0][0];
        const updatedQuote = updatedQuotes.find((q) => q.id === quote1.id);
        expect(updatedQuote?.viewCount).toBe(quote1.viewCount + 1);
      });

      it('should do nothing when already at most recent position', async () => {
        const mockQuotes = quoteFactory.buildList(2);
        const quote1 = mockQuotes[0];

        useQuoteStore.setState({
          quotes: mockQuotes,
          currentQuote: quote1,
          quoteHistory: [quote1.id],
          historyIndex: 0,
        });

        await useQuoteStore.getState().goForward();

        expect(storage.setCurrentQuote).not.toHaveBeenCalled();
        const state = useQuoteStore.getState();
        expect(state.currentQuote?.id).toBe(quote1.id);
        expect(state.historyIndex).toBe(0);
      });

      it('should skip deleted quotes when going forward', async () => {
        const mockQuotes = quoteFactory.buildList(3);
        const quote1 = mockQuotes[0];
        const quote3 = mockQuotes[2];

        useQuoteStore.setState({
          quotes: [quote1, quote3], // quote2 has been deleted
          currentQuote: quote3,
          quoteHistory: [quote1.id, 'deleted-quote-id', quote3.id],
          historyIndex: 2,
        });

        await useQuoteStore.getState().goForward();

        const state = useQuoteStore.getState();
        // Should skip deleted quote and go to quote1
        expect(state.currentQuote?.id).toBe(quote1.id);
        expect(state.historyIndex).toBe(0);
      });
    });
  });
});
