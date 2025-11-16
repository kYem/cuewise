import { quoteFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuoteStore } from '../stores/quote-store';
import { QuoteDisplay } from './QuoteDisplay';

// Mock the quote store
vi.mock('../stores/quote-store', () => ({
  useQuoteStore: vi.fn(),
}));

describe('QuoteDisplay - Navigation', () => {
  const mockRefreshQuote = vi.fn();
  const mockGoBack = vi.fn();
  const mockGoForward = vi.fn();
  const mockCanGoBack = vi.fn();
  const mockCanGoForward = vi.fn();
  const mockToggleFavorite = vi.fn();
  const mockHideQuote = vi.fn();
  const mockInitialize = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation
    vi.mocked(useQuoteStore).mockReturnValue({
      quotes: [],
      currentQuote: null,
      isLoading: false,
      error: null,
      quoteHistory: [],
      historyIndex: 0,
      initialize: mockInitialize,
      refreshQuote: mockRefreshQuote,
      goBack: mockGoBack,
      goForward: mockGoForward,
      canGoBack: mockCanGoBack,
      canGoForward: mockCanGoForward,
      toggleFavorite: mockToggleFavorite,
      hideQuote: mockHideQuote,
      unhideQuote: vi.fn(),
      addCustomQuote: vi.fn(),
      editQuote: vi.fn(),
      deleteQuote: vi.fn(),
      incrementViewCount: vi.fn(),
    });
  });

  describe('Navigation buttons', () => {
    it('should render back, forward, and new quote buttons', () => {
      const mockQuote = quoteFactory.build();
      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        canGoBack: () => true,
        canGoForward: () => true,
      });

      render(<QuoteDisplay />);

      expect(screen.getByTitle('Previous quote')).toBeInTheDocument();
      expect(screen.getByTitle('New quote')).toBeInTheDocument();
      expect(screen.getByTitle('Next quote')).toBeInTheDocument();
    });

    it('should call goBack when back button is clicked', async () => {
      const user = userEvent.setup();
      const mockQuote = quoteFactory.build();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        goBack: mockGoBack,
        canGoBack: () => true,
      });

      render(<QuoteDisplay />);

      const backButton = screen.getByTitle('Previous quote');
      await user.click(backButton);

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('should call goForward when forward button is clicked', async () => {
      const user = userEvent.setup();
      const mockQuote = quoteFactory.build();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        goForward: mockGoForward,
        canGoForward: () => true,
      });

      render(<QuoteDisplay />);

      const forwardButton = screen.getByTitle('Next quote');
      await user.click(forwardButton);

      expect(mockGoForward).toHaveBeenCalledTimes(1);
    });

    it('should call refreshQuote when new quote button is clicked', async () => {
      const user = userEvent.setup();
      const mockQuote = quoteFactory.build();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        refreshQuote: mockRefreshQuote,
      });

      render(<QuoteDisplay />);

      const newQuoteButton = screen.getByTitle('New quote');
      await user.click(newQuoteButton);

      expect(mockRefreshQuote).toHaveBeenCalledTimes(1);
    });
  });

  describe('Navigation button states', () => {
    it('should disable back button when canGoBack returns false', () => {
      const mockQuote = quoteFactory.build();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        canGoBack: () => false,
        canGoForward: () => true,
      });

      render(<QuoteDisplay />);

      const backButton = screen.getByTitle('Previous quote');
      expect(backButton).toBeDisabled();
    });

    it('should disable forward button when canGoForward returns false', () => {
      const mockQuote = quoteFactory.build();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        canGoBack: () => true,
        canGoForward: () => false,
      });

      render(<QuoteDisplay />);

      const forwardButton = screen.getByTitle('Next quote');
      expect(forwardButton).toBeDisabled();
    });

    it('should enable back button when canGoBack returns true', () => {
      const mockQuote = quoteFactory.build();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        canGoBack: () => true,
        canGoForward: () => false,
      });

      render(<QuoteDisplay />);

      const backButton = screen.getByTitle('Previous quote');
      expect(backButton).not.toBeDisabled();
    });

    it('should enable forward button when canGoForward returns true', () => {
      const mockQuote = quoteFactory.build();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        canGoBack: () => false,
        canGoForward: () => true,
      });

      render(<QuoteDisplay />);

      const forwardButton = screen.getByTitle('Next quote');
      expect(forwardButton).not.toBeDisabled();
    });

    it('should disable both navigation buttons when at the only quote in history', () => {
      const mockQuote = quoteFactory.build();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        canGoBack: () => false,
        canGoForward: () => false,
      });

      render(<QuoteDisplay />);

      const backButton = screen.getByTitle('Previous quote');
      const forwardButton = screen.getByTitle('Next quote');

      expect(backButton).toBeDisabled();
      expect(forwardButton).toBeDisabled();
    });
  });

  describe('onManualRefresh callback', () => {
    it('should call onManualRefresh when going back', async () => {
      const user = userEvent.setup();
      const mockQuote = quoteFactory.build();
      const onManualRefresh = vi.fn();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        goBack: mockGoBack,
        canGoBack: () => true,
      });

      render(<QuoteDisplay onManualRefresh={onManualRefresh} />);

      const backButton = screen.getByTitle('Previous quote');
      await user.click(backButton);

      expect(onManualRefresh).toHaveBeenCalledTimes(1);
    });

    it('should call onManualRefresh when going forward', async () => {
      const user = userEvent.setup();
      const mockQuote = quoteFactory.build();
      const onManualRefresh = vi.fn();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        goForward: mockGoForward,
        canGoForward: () => true,
      });

      render(<QuoteDisplay onManualRefresh={onManualRefresh} />);

      const forwardButton = screen.getByTitle('Next quote');
      await user.click(forwardButton);

      expect(onManualRefresh).toHaveBeenCalledTimes(1);
    });

    it('should call onManualRefresh when clicking new quote', async () => {
      const user = userEvent.setup();
      const mockQuote = quoteFactory.build();
      const onManualRefresh = vi.fn();

      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        currentQuote: mockQuote,
        refreshQuote: mockRefreshQuote,
      });

      render(<QuoteDisplay onManualRefresh={onManualRefresh} />);

      const newQuoteButton = screen.getByTitle('New quote');
      await user.click(newQuoteButton);

      expect(onManualRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('Loading and error states', () => {
    it('should show loading spinner when isLoading is true', () => {
      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        isLoading: true,
        currentQuote: null,
      });

      const { container } = render(<QuoteDisplay />);

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('border-primary-600');
    });

    it('should show error fallback when error exists', () => {
      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        isLoading: false,
        error: 'Failed to load quotes',
      });

      render(<QuoteDisplay />);

      const errorTitle = screen.getByRole('heading', { name: 'Failed to load quotes' });
      expect(errorTitle).toBeInTheDocument();
    });

    it('should not render navigation buttons when no current quote', () => {
      vi.mocked(useQuoteStore).mockReturnValue({
        ...vi.mocked(useQuoteStore)(),
        isLoading: false,
        currentQuote: null,
      });

      render(<QuoteDisplay />);

      expect(screen.queryByTitle('Previous quote')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Next quote')).not.toBeInTheDocument();
    });
  });
});
