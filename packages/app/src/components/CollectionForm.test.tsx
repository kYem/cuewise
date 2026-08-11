import type { QuoteCollection } from '@cuewise/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuoteStore } from '../stores/quote-store';
import { CollectionForm } from './CollectionForm';

vi.mock('../stores/quote-store', () => ({
  useQuoteStore: vi.fn(),
}));

const existing: QuoteCollection = {
  id: 'c1',
  name: 'Morning Motivation',
  createdAt: new Date().toISOString(),
};

function mockStore(updateCollection: ReturnType<typeof vi.fn>) {
  const createCollection = vi.fn().mockResolvedValue(true);
  vi.mocked(useQuoteStore).mockReturnValue({ createCollection, updateCollection } as never);
  return createCollection;
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

describe('CollectionForm editing an existing collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes once the rename is saved', async () => {
    mockStore(vi.fn().mockResolvedValue('saved'));
    const onClose = vi.fn();

    render(<CollectionForm collection={existing} onClose={onClose} />);
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // The store has already said the collection is gone, and a retry can never succeed — offering
  // one would point the user at a collection that no longer exists.
  it('closes without an error when the pull deleted it first', async () => {
    mockStore(vi.fn().mockResolvedValue('gone'));
    const onClose = vi.fn();

    render(<CollectionForm collection={existing} onClose={onClose} />);
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText(/Failed to save collection/)).not.toBeInTheDocument();
  });

  it('stays open and offers a retry when the write failed', async () => {
    mockStore(vi.fn().mockResolvedValue('failed'));
    const onClose = vi.fn();

    render(<CollectionForm collection={existing} onClose={onClose} />);
    save();

    await waitFor(() =>
      expect(screen.getByText('Failed to save collection. Please try again.')).toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
