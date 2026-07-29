import { quoteFactory } from '@cuewise/test-utils/factories';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useQuoteStore } from '../stores/quote-store';
import { QuoteManagementPage } from './QuoteManagementPage';

// A failed initialize leaves the quotes empty and isLoading false — the exact shape the effect
// used to gate on, so it re-fired on every store update: a storage read and an error toast each.
describe('QuoteManagementPage initialization', () => {
  it('attempts initialize once when it fails and leaves the quotes empty', async () => {
    let attempts = 0;
    const initialize = vi.fn(async () => {
      attempts += 1;
      // Capped so a regression fails the assertion instead of spinning the whole suite.
      if (attempts > 5) {
        return;
      }
      useQuoteStore.setState({ isLoading: true, error: null });
      await new Promise((resolve) => setTimeout(resolve, 0));
      useQuoteStore.setState({ isLoading: false, error: 'Failed to load quotes.', quotes: [] });
    });
    useQuoteStore.setState({
      quotes: [],
      isLoading: false,
      error: 'Failed to load quotes.',
      initialize,
    });

    render(<QuoteManagementPage />);
    await waitFor(() => expect(initialize).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(initialize).toHaveBeenCalledTimes(1);
  });

  // The already-loaded path returned before the ref was ever set, so the guard held only for
  // a page that started empty — deleting the last quote reopened the loop.
  it('holds the guard when the page started with quotes and then lost them', async () => {
    const initialize = vi.fn(async () => {});
    useQuoteStore.setState({
      quotes: [],
      isLoading: false,
      error: null,
      initialize,
    });
    useQuoteStore.setState({ quotes: [quoteFactory.build()] });

    const { rerender } = render(<QuoteManagementPage />);
    useQuoteStore.setState({ quotes: [] });
    rerender(<QuoteManagementPage />);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(initialize).not.toHaveBeenCalled();
  });
});
