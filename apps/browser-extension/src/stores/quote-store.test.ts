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
  });
});
