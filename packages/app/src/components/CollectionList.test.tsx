import type { QuoteCollection } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuoteStore } from '../stores/quote-store';
import { CollectionList } from './CollectionList';

vi.mock('../stores/quote-store', () => ({
  useQuoteStore: vi.fn(),
}));

const mine: QuoteCollection = {
  id: 'c1',
  name: 'Morning Motivation',
  createdAt: new Date().toISOString(),
};

type QuoteStore = ReturnType<typeof useQuoteStore.getState>;

function renderList(deleted: boolean) {
  const deleteCollection = vi.fn<QuoteStore['deleteCollection']>().mockResolvedValue(deleted);
  vi.mocked(useQuoteStore).mockImplementation(
    createSelectorMock({
      collections: [mine],
      quotes: [],
      activeCollectionIds: [],
      deleteCollection,
      setActiveCollections: vi.fn(),
    })
  );
  render(<CollectionList />);
  return { deleteCollection };
}

async function openDeleteConfirm(): Promise<void> {
  fireEvent.click(screen.getByTitle('Delete collection'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument());
}

describe('CollectionList deleting a collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The dialog relabels to "Processing..." while the write is in flight, so a plain
  // queryByRole('Delete') is already null before the outcome is known.
  it('closes the confirmation once the delete lands', async () => {
    renderList(true);

    await openDeleteConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Processing...' })).not.toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('keeps the confirmation open when the delete did not land', async () => {
    renderList(false);

    await openDeleteConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled());
  });
});
