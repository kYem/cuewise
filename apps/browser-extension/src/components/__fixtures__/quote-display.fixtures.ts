import type { Quote } from '@cuewise/shared';
import { quoteFactory } from '@cuewise/test-utils/factories';
import { type Mock, vi } from 'vitest';

/**
 * Common test fixtures for QuoteDisplay component tests
 * This file provides reusable mock stores and test scenarios
 */

// ============================================================================
// Mock Store Return Types
// ============================================================================

export interface MockQuoteStore {
  quotes: Quote[];
  currentQuote: Quote | null;
  isLoading: boolean;
  error: string | null;
  quoteHistory: string[];
  historyIndex: number;
  initialize: Mock;
  refreshQuote: Mock;
  goBack: Mock;
  goForward: Mock;
  canGoBack: Mock;
  canGoForward: Mock;
  toggleFavorite: Mock;
  hideQuote: Mock;
  unhideQuote: Mock;
  addCustomQuote: Mock;
  editQuote: Mock;
  deleteQuote: Mock;
  incrementViewCount: Mock;
}

// ============================================================================
// Mock Store Builders
// ============================================================================

/**
 * Creates a default mock store with all methods
 */
export function createMockStore(overrides: Partial<MockQuoteStore> = {}): MockQuoteStore {
  return {
    quotes: [],
    currentQuote: null,
    isLoading: false,
    error: null,
    quoteHistory: [],
    historyIndex: 0,
    initialize: overrides.initialize || (vi.fn() as Mock),
    refreshQuote: overrides.refreshQuote || (vi.fn() as Mock),
    goBack: overrides.goBack || (vi.fn() as Mock),
    goForward: overrides.goForward || (vi.fn() as Mock),
    canGoBack: overrides.canGoBack || (vi.fn(() => false) as Mock),
    canGoForward: overrides.canGoForward || (vi.fn(() => false) as Mock),
    toggleFavorite: overrides.toggleFavorite || (vi.fn() as Mock),
    hideQuote: overrides.hideQuote || (vi.fn() as Mock),
    unhideQuote: overrides.unhideQuote || (vi.fn() as Mock),
    addCustomQuote: overrides.addCustomQuote || (vi.fn() as Mock),
    editQuote: overrides.editQuote || (vi.fn() as Mock),
    deleteQuote: overrides.deleteQuote || (vi.fn() as Mock),
    incrementViewCount: overrides.incrementViewCount || (vi.fn() as Mock),
    ...overrides,
  };
}

/**
 * Creates a mock store with a quote loaded and ready to display
 */
export function createLoadedMockStore(quote?: Quote, overrides: Partial<MockQuoteStore> = {}) {
  const currentQuote = quote || quoteFactory.build();

  return createMockStore({
    currentQuote,
    quotes: [currentQuote],
    isLoading: false,
    error: null,
    ...overrides,
  });
}

/**
 * Creates a mock store in loading state
 */
export function createLoadingMockStore(overrides: Partial<MockQuoteStore> = {}) {
  return createMockStore({
    isLoading: true,
    currentQuote: null,
    ...overrides,
  });
}

/**
 * Creates a mock store in error state
 */
export function createErrorMockStore(
  errorMessage = 'Failed to load quotes',
  overrides: Partial<MockQuoteStore> = {}
) {
  return createMockStore({
    isLoading: false,
    error: errorMessage,
    currentQuote: null,
    ...overrides,
  });
}

/**
 * Creates a mock store with no quotes available
 */
export function createEmptyMockStore(overrides: Partial<MockQuoteStore> = {}) {
  return createMockStore({
    isLoading: false,
    currentQuote: null,
    quotes: [],
    ...overrides,
  });
}

// ============================================================================
// Navigation State Builders
// ============================================================================

/**
 * Creates a mock store with navigation enabled (can go back and forward)
 */
export function createNavigableMockStore(quote?: Quote, overrides: Partial<MockQuoteStore> = {}) {
  return createLoadedMockStore(quote, {
    canGoBack: vi.fn(() => true) as Mock,
    canGoForward: vi.fn(() => true) as Mock,
    quoteHistory: ['quote1', 'quote2', 'quote3'],
    historyIndex: 1,
    ...overrides,
  });
}

/**
 * Creates a mock store at the beginning of history (can only go back)
 */
export function createAtBeginningMockStore(quote?: Quote, overrides: Partial<MockQuoteStore> = {}) {
  return createLoadedMockStore(quote, {
    canGoBack: vi.fn(() => true) as Mock,
    canGoForward: vi.fn(() => false) as Mock,
    quoteHistory: ['quote1', 'quote2'],
    historyIndex: 0,
    ...overrides,
  });
}

/**
 * Creates a mock store at the end of history (can only go forward)
 */
export function createAtEndMockStore(quote?: Quote, overrides: Partial<MockQuoteStore> = {}) {
  return createLoadedMockStore(quote, {
    canGoBack: vi.fn(() => false) as Mock,
    canGoForward: vi.fn(() => true) as Mock,
    quoteHistory: ['quote1', 'quote2'],
    historyIndex: 1,
    ...overrides,
  });
}

/**
 * Creates a mock store with no navigation available (single quote in history)
 */
export function createNoNavigationMockStore(
  quote?: Quote,
  overrides: Partial<MockQuoteStore> = {}
) {
  return createLoadedMockStore(quote, {
    canGoBack: vi.fn(() => false) as Mock,
    canGoForward: vi.fn(() => false) as Mock,
    quoteHistory: ['quote1'],
    historyIndex: 0,
    ...overrides,
  });
}

// ============================================================================
// Test Scenarios
// ============================================================================

/**
 * Navigation button test scenario
 */
export interface NavigationButtonScenario {
  description: string;
  mockStore: MockQuoteStore;
  buttonTitle: string;
  expectedMethod: keyof MockQuoteStore;
  shouldBeDisabled?: boolean;
}

/**
 * Creates test scenarios for all navigation button states
 */
export function createNavigationButtonScenarios() {
  const quote = quoteFactory.build();

  return {
    backEnabled: {
      description: 'back button enabled when can go back',
      mockStore: createAtBeginningMockStore(quote),
      buttonTitle: 'Previous quote',
      expectedMethod: 'goBack' as const,
      shouldBeDisabled: false,
    },
    backDisabled: {
      description: 'back button disabled when cannot go back',
      mockStore: createNoNavigationMockStore(quote),
      buttonTitle: 'Previous quote',
      expectedMethod: 'goBack' as const,
      shouldBeDisabled: true,
    },
    forwardEnabled: {
      description: 'forward button enabled when can go forward',
      mockStore: createAtEndMockStore(quote),
      buttonTitle: 'Next quote',
      expectedMethod: 'goForward' as const,
      shouldBeDisabled: false,
    },
    forwardDisabled: {
      description: 'forward button disabled when cannot go forward',
      mockStore: createNoNavigationMockStore(quote),
      buttonTitle: 'Next quote',
      expectedMethod: 'goForward' as const,
      shouldBeDisabled: true,
    },
    newQuote: {
      description: 'new quote button always enabled',
      mockStore: createLoadedMockStore(quote),
      buttonTitle: 'New quote',
      expectedMethod: 'refreshQuote' as const,
      shouldBeDisabled: false,
    },
  };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Validates that a navigation method was called
 */
export function expectNavigationMethodCalled(store: MockQuoteStore, method: keyof MockQuoteStore) {
  const mockMethod = store[method];
  if (typeof mockMethod === 'function') {
    expect(mockMethod).toHaveBeenCalledTimes(1);
  }
}

/**
 * Validates that a callback was called after navigation
 */
export function expectCallbackCalledAfterNavigation(callback: Mock) {
  expect(callback).toHaveBeenCalledTimes(1);
}

/**
 * Validates button state (enabled/disabled)
 */
export function expectButtonState(button: HTMLElement, shouldBeDisabled: boolean) {
  if (shouldBeDisabled) {
    expect(button).toBeDisabled();
  } else {
    expect(button).not.toBeDisabled();
  }
}
