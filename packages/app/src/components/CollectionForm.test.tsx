import type { QuoteCollection } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
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

type QuoteStore = ReturnType<typeof useQuoteStore.getState>;
type Outcome = Awaited<ReturnType<QuoteStore['updateCollection']>>;

// createSelectorMock, not mockReturnValue: it honours a selector argument, so this keeps working
// if the component ever subscribes that way, and the cast it avoids would untype `Outcome`.
function mockStore(outcome: Outcome, created = true) {
  const updateCollection = vi.fn<QuoteStore['updateCollection']>().mockResolvedValue(outcome);
  const createCollection = vi.fn<QuoteStore['createCollection']>().mockResolvedValue(created);
  vi.mocked(useQuoteStore).mockImplementation(
    createSelectorMock({ createCollection, updateCollection })
  );
  return { createCollection, updateCollection };
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

describe('CollectionForm editing an existing collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes once the rename is saved', async () => {
    mockStore('saved');
    const onClose = vi.fn();

    render(<CollectionForm collection={existing} onClose={onClose} />);
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // The store has already said the collection is gone, and a retry can never succeed — offering
  // one would point the user at a collection that no longer exists.
  it('closes without an error when the pull deleted it first', async () => {
    mockStore('gone');
    const onClose = vi.fn();

    render(<CollectionForm collection={existing} onClose={onClose} />);
    save();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByText(/Failed to save collection/)).not.toBeInTheDocument();
  });

  it('stays open and offers a retry when the write failed', async () => {
    mockStore('failed');
    const onClose = vi.fn();

    render(<CollectionForm collection={existing} onClose={onClose} />);
    save();

    await waitFor(() =>
      expect(screen.getByText('Failed to save collection. Please try again.')).toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('CollectionForm creating a new collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const create = () => fireEvent.click(screen.getByRole('button', { name: 'Create Collection' }));

  function nameIt() {
    fireEvent.change(screen.getByPlaceholderText('e.g., Morning Motivation'), {
      target: { value: 'Evening Wind-down' },
    });
  }

  it('closes once the collection is created', async () => {
    mockStore('saved', true);
    const onClose = vi.fn();

    render(<CollectionForm onClose={onClose} />);
    nameIt();
    create();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open and offers a retry when the write failed', async () => {
    mockStore('saved', false);
    const onClose = vi.fn();

    render(<CollectionForm onClose={onClose} />);
    nameIt();
    create();

    await waitFor(() =>
      expect(screen.getByText('Failed to save collection. Please try again.')).toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
