import type { Quote } from '@cuewise/shared';
import { quoteFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, type Mock, vi } from 'vitest';
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

// The store answers whether the write landed; a failed one must leave the user's picks alone
// rather than making them re-select everything to retry.
describe('QuoteManagementPage bulk selection', () => {
  const mine = quoteFactory.build({ id: 'mine', isHidden: false });

  function bulkToolbar(): HTMLElement {
    return screen.getByRole('toolbar', { name: 'Bulk actions' });
  }

  async function selectOneQuote(): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: /Enable Selection/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Select All/ }));
  }

  function renderWith(bulkToggleHidden: Mock): void {
    useQuoteStore.setState({
      quotes: [mine],
      isLoading: false,
      error: null,
      initialize: vi.fn(async () => undefined),
      bulkToggleHidden,
    });
    render(<QuoteManagementPage />);
  }

  // A flipped argument here inverts a bulk action across the user's whole selection, and
  // nothing else in the suite reaches these handlers.
  it.each([
    ['Add to favorites', 'bulkToggleFavorite' as const, {} as Partial<Quote>, [['mine'], true]],
    [
      'Remove from favorites',
      'bulkToggleFavorite' as const,
      { isFavorite: true } as Partial<Quote>,
      [['mine'], false],
    ],
    ['Hide quotes', 'bulkToggleHidden' as const, {} as Partial<Quote>, [['mine'], true]],
    // Hidden quotes sit behind the Hidden filter, so this row switches to it first.
    [
      'Unhide quotes',
      'bulkToggleHidden' as const,
      { isHidden: true } as Partial<Quote>,
      [['mine'], false],
    ],
  ])('%s calls the store with the argument that matches the button', async (label, method, seed, expected) => {
    const writer = vi.fn(async () => true);
    useQuoteStore.setState({
      quotes: [quoteFactory.build({ id: 'mine', isFavorite: false, isHidden: false, ...seed })],
      isLoading: false,
      error: null,
      initialize: vi.fn(async () => undefined),
      [method]: writer,
    });
    render(<QuoteManagementPage />);
    if (seed.isHidden === true) {
      fireEvent.click(screen.getByRole('button', { name: 'Hidden' }));
    }
    await selectOneQuote();

    // Scoped: the per-quote card carries the same two favourite titles.
    fireEvent.click(within(bulkToolbar()).getByTitle(label));

    await waitFor(() => expect(writer).toHaveBeenCalledWith(...expected));
  });

  it.each([
    ['keeps the selection when the write failed', false, '1 selected'],
    ['clears the selection once the write lands', true, null],
  ])('%s', async (_label, landed, stillSelected) => {
    const bulkToggleHidden = vi.fn(async () => landed);
    renderWith(bulkToggleHidden);
    await selectOneQuote();
    fireEvent.click(screen.getByTitle('Hide quotes'));

    await waitFor(() => expect(bulkToggleHidden).toHaveBeenCalledWith(['mine'], true));
    if (stillSelected === null) {
      await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
    } else {
      await waitFor(() => expect(screen.getByText(stillSelected)).toBeInTheDocument());
    }
  });
});
