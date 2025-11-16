import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuoteStore } from '../stores/quote-store';
import {
  createAtBeginningMockStore,
  createAtEndMockStore,
  createEmptyMockStore,
  createErrorMockStore,
  createLoadedMockStore,
  createLoadingMockStore,
  createMockStore,
  createNavigableMockStore,
  createNoNavigationMockStore,
  expectButtonState,
  expectCallbackCalledAfterNavigation,
  expectNavigationMethodCalled,
} from './__fixtures__/quote-display.fixtures';
import { QuoteDisplay } from './QuoteDisplay';

// Mock the quote store
vi.mock('../stores/quote-store', () => ({
  useQuoteStore: vi.fn(),
}));

describe('QuoteDisplay - Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation using fixture
    vi.mocked(useQuoteStore).mockReturnValue(createMockStore());
  });

  describe('Navigation buttons', () => {
    it('should render back, forward, and new quote buttons', () => {
      const mockStore = createNavigableMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      expect(screen.getByTitle('Previous quote')).toBeInTheDocument();
      expect(screen.getByTitle('New quote')).toBeInTheDocument();
      expect(screen.getByTitle('Next quote')).toBeInTheDocument();
    });

    it('should call goBack when back button is clicked', async () => {
      const user = userEvent.setup();
      const mockStore = createAtBeginningMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      const backButton = screen.getByTitle('Previous quote');
      await user.click(backButton);

      expectNavigationMethodCalled(mockStore, 'goBack');
    });

    it('should call goForward when forward button is clicked', async () => {
      const user = userEvent.setup();
      const mockStore = createAtEndMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      const forwardButton = screen.getByTitle('Next quote');
      await user.click(forwardButton);

      expectNavigationMethodCalled(mockStore, 'goForward');
    });

    it('should call refreshQuote when new quote button is clicked', async () => {
      const user = userEvent.setup();
      const mockStore = createLoadedMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      const newQuoteButton = screen.getByTitle('New quote');
      await user.click(newQuoteButton);

      expectNavigationMethodCalled(mockStore, 'refreshQuote');
    });
  });

  describe('Navigation button states', () => {
    it('should disable back button when canGoBack returns false', () => {
      const mockStore = createAtBeginningMockStore();
      mockStore.canGoBack = vi.fn(() => false);
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      const backButton = screen.getByTitle('Previous quote');
      expectButtonState(backButton, true);
    });

    it('should disable forward button when canGoForward returns false', () => {
      const mockStore = createAtEndMockStore();
      mockStore.canGoForward = vi.fn(() => false);
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      const forwardButton = screen.getByTitle('Next quote');
      expectButtonState(forwardButton, true);
    });

    it('should enable back button when canGoBack returns true', () => {
      const mockStore = createAtBeginningMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      const backButton = screen.getByTitle('Previous quote');
      expectButtonState(backButton, false);
    });

    it('should enable forward button when canGoForward returns true', () => {
      const mockStore = createAtEndMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      const forwardButton = screen.getByTitle('Next quote');
      expectButtonState(forwardButton, false);
    });

    it('should disable both navigation buttons when at the only quote in history', () => {
      const mockStore = createNoNavigationMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      const backButton = screen.getByTitle('Previous quote');
      const forwardButton = screen.getByTitle('Next quote');

      expectButtonState(backButton, true);
      expectButtonState(forwardButton, true);
    });
  });

  describe('onManualRefresh callback', () => {
    it('should call onManualRefresh when going back', async () => {
      const user = userEvent.setup();
      const onManualRefresh = vi.fn();
      const mockStore = createAtBeginningMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay onManualRefresh={onManualRefresh} />);

      const backButton = screen.getByTitle('Previous quote');
      await user.click(backButton);

      expectCallbackCalledAfterNavigation(onManualRefresh);
    });

    it('should call onManualRefresh when going forward', async () => {
      const user = userEvent.setup();
      const onManualRefresh = vi.fn();
      const mockStore = createAtEndMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay onManualRefresh={onManualRefresh} />);

      const forwardButton = screen.getByTitle('Next quote');
      await user.click(forwardButton);

      expectCallbackCalledAfterNavigation(onManualRefresh);
    });

    it('should call onManualRefresh when clicking new quote', async () => {
      const user = userEvent.setup();
      const onManualRefresh = vi.fn();
      const mockStore = createLoadedMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay onManualRefresh={onManualRefresh} />);

      const newQuoteButton = screen.getByTitle('New quote');
      await user.click(newQuoteButton);

      expectCallbackCalledAfterNavigation(onManualRefresh);
    });
  });

  describe('Loading and error states', () => {
    it('should show loading spinner when isLoading is true', () => {
      const mockStore = createLoadingMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      const { container } = render(<QuoteDisplay />);

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('border-primary-600');
    });

    it('should show error fallback when error exists', () => {
      const mockStore = createErrorMockStore('Failed to load quotes');
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      const errorTitle = screen.getByRole('heading', { name: 'Failed to load quotes' });
      expect(errorTitle).toBeInTheDocument();
    });

    it('should not render navigation buttons when no current quote', () => {
      const mockStore = createEmptyMockStore();
      vi.mocked(useQuoteStore).mockReturnValue(mockStore);

      render(<QuoteDisplay />);

      expect(screen.queryByTitle('Previous quote')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Next quote')).not.toBeInTheDocument();
    });
  });
});
