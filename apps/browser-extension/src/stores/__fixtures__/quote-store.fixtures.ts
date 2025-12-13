import { ALL_QUOTE_CATEGORIES, type Quote, type QuoteCategory } from '@cuewise/shared';
import { quoteFactory } from '@cuewise/test-utils/factories';
import type { Mock } from 'vitest';

/**
 * Common test fixtures for quote store tests
 * This file provides reusable test data and setup functions
 */

/**
 * Minimal QuoteStore state interface for test assertions
 */
interface QuoteStoreState {
  currentQuote?: Quote | null;
  historyIndex?: number;
  quoteHistory?: string[];
}

// ============================================================================
// Mock Functions
// ============================================================================

export interface MockStorageFunctions {
  getQuotes: Mock;
  setQuotes: Mock;
  getCurrentQuote: Mock;
  setCurrentQuote: Mock;
}

export interface MockToastFunctions {
  error: Mock;
  warning: Mock;
  success: Mock;
}

// ============================================================================
// Test Data Builders
// ============================================================================

/**
 * Creates a quote history state with specified quotes
 * @param quotes - Array of quotes to use in history
 * @param currentIndex - Current position in history (default: 0)
 * @returns Object with quoteHistory array and historyIndex
 */
export function createQuoteHistoryState(quotes: Quote[], currentIndex = 0) {
  return {
    quoteHistory: quotes.map((q) => q.id),
    historyIndex: currentIndex,
  };
}

/**
 * Creates a store state with navigation history
 * @param options - Configuration options
 * @returns Complete store state object
 */
export function createStoreStateWithHistory(options: {
  quotes: Quote[];
  currentQuote: Quote;
  historyQuotes: Quote[];
  historyIndex?: number;
}) {
  const { quotes, currentQuote, historyQuotes, historyIndex = 0 } = options;

  return {
    quotes,
    currentQuote,
    quoteHistory: historyQuotes.map((q) => q.id),
    historyIndex,
    isLoading: false,
    error: null,
  };
}

/**
 * Creates a set of quotes for navigation testing
 * @param count - Number of quotes to create (default: 3)
 * @returns Object with individual quotes and array
 */
export function createNavigationQuotes(count = 3) {
  const quotes = quoteFactory.buildList(count);

  return {
    quotes,
    quote1: quotes[0],
    quote2: quotes[1],
    quote3: quotes[2],
    quote4: quotes[3],
    quote5: quotes[4],
  };
}

/**
 * Creates a quote with specific properties for testing
 */
export function createQuoteWithProps(overrides: Partial<Quote> = {}) {
  return quoteFactory.build(overrides);
}

/**
 * Creates a hidden quote for testing skip logic
 */
export function createHiddenQuote(overrides: Partial<Quote> = {}) {
  return quoteFactory.build({ ...overrides, isHidden: true });
}

// ============================================================================
// Store State Presets
// ============================================================================

/**
 * Initial empty store state
 */
export const EMPTY_STORE_STATE = {
  quotes: [],
  currentQuote: null,
  isLoading: true,
  error: null,
  quoteHistory: [],
  historyIndex: 0,
};

/**
 * Creates a loaded store state with quotes
 */
export function createLoadedStoreState(quotes: Quote[], currentQuote?: Quote) {
  return {
    quotes,
    currentQuote: currentQuote || quotes[0],
    isLoading: false,
    error: null,
    quoteHistory: currentQuote ? [currentQuote.id] : quotes.length > 0 ? [quotes[0].id] : [],
    historyIndex: 0,
  };
}

/**
 * Creates a store state at the beginning of history (can only go back)
 */
export function createAtBeginningState(quotes: Quote[], history: Quote[]) {
  return {
    quotes,
    currentQuote: history[0],
    quoteHistory: history.map((q) => q.id),
    historyIndex: 0, // At the most recent
    isLoading: false,
    error: null,
  };
}

/**
 * Creates a store state at the end of history (can only go forward)
 */
export function createAtEndState(quotes: Quote[], history: Quote[]) {
  return {
    quotes,
    currentQuote: history[history.length - 1],
    quoteHistory: history.map((q) => q.id),
    historyIndex: history.length - 1, // At the oldest
    isLoading: false,
    error: null,
  };
}

/**
 * Creates a store state in the middle of history (can go both ways)
 */
export function createInMiddleState(quotes: Quote[], history: Quote[], index: number) {
  return {
    quotes,
    currentQuote: history[index],
    quoteHistory: history.map((q) => q.id),
    historyIndex: index,
    isLoading: false,
    error: null,
  };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Validates that navigation moved to the expected quote
 */
export function expectNavigationToQuote(
  state: QuoteStoreState,
  expectedQuote: Quote,
  expectedIndex: number
) {
  expect(state.currentQuote?.id).toBe(expectedQuote.id);
  expect(state.historyIndex).toBe(expectedIndex);
}

/**
 * Validates that view count was incremented for a quote
 */
export function expectViewCountIncremented(
  setQuotesMock: Mock,
  quoteId: string,
  originalViewCount: number
) {
  expect(setQuotesMock).toHaveBeenCalled();
  const updatedQuotes = setQuotesMock.mock.calls[0][0];
  const updatedQuote = updatedQuotes.find((q: Quote) => q.id === quoteId);
  expect(updatedQuote?.viewCount).toBe(originalViewCount + 1);
}

/**
 * Validates that history has the expected structure
 */
export function expectHistoryStructure(
  state: QuoteStoreState,
  expectedLength: number,
  expectedIndex: number,
  expectedCurrentId?: string
) {
  expect(state.quoteHistory?.length).toBe(expectedLength);
  expect(state.historyIndex).toBe(expectedIndex);

  if (expectedCurrentId && state.quoteHistory) {
    expect(state.quoteHistory[expectedIndex]).toBe(expectedCurrentId);
  }
}

/**
 * Validates that forward history was cleared
 */
export function expectForwardHistoryCleared(state: QuoteStoreState, _fromIndex: number) {
  // After clearing forward history from index, we should have:
  // - New quote at index 0
  // - Old history from fromIndex onwards
  expect(state.historyIndex).toBe(0);
  expect(state.quoteHistory?.[0]).toBe(state.currentQuote?.id);
}

// ============================================================================
// Mock Setup Helpers
// ============================================================================

/**
 * Sets up storage mocks to return specific data
 */
export function setupStorageMocks(
  mocks: MockStorageFunctions,
  options: {
    quotes?: Quote[];
    currentQuote?: Quote | null;
  }
) {
  const { quotes = [], currentQuote = null } = options;

  mocks.getQuotes.mockResolvedValue(quotes);
  mocks.getCurrentQuote.mockResolvedValue(currentQuote);
  mocks.setQuotes.mockResolvedValue(undefined);
  mocks.setCurrentQuote.mockResolvedValue(undefined);
}

/**
 * Sets up storage mocks to simulate an error
 */
export function setupStorageError(mocks: MockStorageFunctions, errorMessage = 'Storage error') {
  mocks.getQuotes.mockRejectedValue(new Error(errorMessage));
}

// ============================================================================
// Test Scenarios
// ============================================================================

/**
 * Creates a test scenario for navigation with hidden quotes
 */
export function createHiddenQuoteScenario() {
  const visibleQuotes = quoteFactory.buildList(2);
  const hiddenQuote = createHiddenQuote();

  return {
    allQuotes: [visibleQuotes[0], hiddenQuote, visibleQuotes[1]],
    visibleQuotes,
    hiddenQuote,
    history: [visibleQuotes[0].id, hiddenQuote.id, visibleQuotes[1].id],
  };
}

/**
 * Creates a test scenario for navigation with deleted quotes
 */
export function createDeletedQuoteScenario() {
  const existingQuotes = quoteFactory.buildList(2);
  const deletedQuoteId = 'deleted-quote-id';

  return {
    existingQuotes,
    deletedQuoteId,
    history: [existingQuotes[0].id, deletedQuoteId, existingQuotes[1].id],
  };
}

/**
 * Creates a test scenario for clearing forward history
 */
export function createForwardHistoryClearScenario() {
  const { quotes, quote1, quote2, quote3 } = createNavigationQuotes(3);

  return {
    quotes,
    initialHistory: [quote1, quote2, quote3],
    currentQuote: quote2,
    historyIndex: 1,
    // After refresh from this position:
    // - quote1 (forward history) should be removed
    // - New quote added at index 0
    // - quote2 should remain in history
  };
}

/**
 * Creates a test scenario for favorites filter with store state ready to use
 */
export function createFavoritesScenario(options: {
  showFavoritesOnly: boolean;
  hasFavorites?: boolean;
}) {
  const { showFavoritesOnly, hasFavorites = true } = options;

  const favoriteQuotes = hasFavorites ? quoteFactory.buildList(2, { isFavorite: true }) : [];
  const nonFavoriteQuotes = quoteFactory.buildList(2, { isFavorite: false });
  const allQuotes = [...favoriteQuotes, ...nonFavoriteQuotes];
  const currentQuote = nonFavoriteQuotes[0];

  return {
    state: {
      quotes: allQuotes,
      currentQuote,
      quoteHistory: [currentQuote.id],
      historyIndex: 0,
      isLoading: false,
      error: null,
      showFavoritesOnly,
      enabledCategories: [...ALL_QUOTE_CATEGORIES] as QuoteCategory[],
      showCustomQuotes: true,
    },
    favoriteQuotes,
    nonFavoriteQuotes,
  };
}

/**
 * Creates quotes for testing category + favorites combination
 */
export function createCategoryFavoritesScenario() {
  const favoriteInspiration = quoteFactory.build({ isFavorite: true, category: 'inspiration' });
  const favoriteProductivity = quoteFactory.build({ isFavorite: true, category: 'productivity' });
  const nonFavoriteInspiration = quoteFactory.build({ isFavorite: false, category: 'inspiration' });

  return {
    quotes: [favoriteInspiration, favoriteProductivity, nonFavoriteInspiration],
    favoriteInspiration,
    currentQuote: nonFavoriteInspiration,
  };
}
