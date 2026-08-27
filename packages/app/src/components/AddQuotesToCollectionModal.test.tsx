import type { QuoteCollection } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { quoteFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuoteStore } from '../stores/quote-store';
import { AddQuotesToCollectionModal } from './AddQuotesToCollectionModal';

vi.mock('../stores/quote-store', () => ({
  useQuoteStore: vi.fn(),
}));

const collection: QuoteCollection = {
  id: 'c1',
  name: 'Morning Motivation',
  createdAt: new Date().toISOString(),
};

type QuoteStore = ReturnType<typeof useQuoteStore.getState>;
type Outcome = Awaited<ReturnType<QuoteStore['addQuoteToCollection']>>;

const member = quoteFactory.build({ id: 'q1', text: 'Already in', collectionIds: ['c1'] });
const outsider = quoteFactory.build({ id: 'q2', text: 'Not in yet', collectionIds: [] });

function renderModal(outcome: Outcome, removeOutcome: Outcome = outcome) {
  const addQuoteToCollection = vi
    .fn<QuoteStore['addQuoteToCollection']>()
    .mockResolvedValue(outcome);
  const removeQuoteFromCollection = vi
    .fn<QuoteStore['removeQuoteFromCollection']>()
    .mockResolvedValue(removeOutcome);
  vi.mocked(useQuoteStore).mockImplementation(
    createSelectorMock({
      quotes: [member, outsider],
      addQuoteToCollection,
      removeQuoteFromCollection,
    })
  );
  const onClose = vi.fn();
  render(<AddQuotesToCollectionModal collection={collection} onClose={onClose} />);
  return { onClose, addQuoteToCollection, removeQuoteFromCollection };
}

function toggleOutsider() {
  fireEvent.click(screen.getByRole('button', { name: /Not in yet/ }));
}

function toggleMember() {
  fireEvent.click(screen.getByRole('button', { name: /Already in/ }));
}

function apply() {
  fireEvent.click(screen.getByRole('button', { name: /Apply Changes/ }));
}

describe('AddQuotesToCollectionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes once the pending changes are applied', async () => {
    const { onClose } = renderModal('saved');

    toggleOutsider();
    apply();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // A deleted quote can never be applied, so holding the modal open on it is an unbreakable
  // loop: every retry reaches the same answer.
  it('closes when a pull deleted the quote before the write', async () => {
    const { onClose } = renderModal('gone');

    toggleOutsider();
    apply();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open when the write did not persist', async () => {
    const { onClose } = renderModal('failed');

    toggleOutsider();
    apply();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Apply Changes/ })).toBeEnabled()
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('AddQuotesToCollectionModal applying a mixed batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Untoggling a member is the other half of the ternary, and nothing else covers it.
  it('removes the memberships it was asked to remove', async () => {
    const { removeQuoteFromCollection } = renderModal('saved');

    toggleMember();
    apply();

    await waitFor(() => expect(removeQuoteFromCollection).toHaveBeenCalledWith('q1', 'c1'));
  });

  // One retryable failure must not abandon the rest of the batch, and must keep the modal open.
  it('applies every change even when one of them fails', async () => {
    const { onClose, addQuoteToCollection, removeQuoteFromCollection } = renderModal(
      'saved',
      'failed'
    );

    toggleMember();
    toggleOutsider();
    apply();

    await waitFor(() => expect(addQuoteToCollection).toHaveBeenCalledWith('q2', 'c1'));
    expect(removeQuoteFromCollection).toHaveBeenCalledWith('q1', 'c1');
    expect(onClose).not.toHaveBeenCalled();
    // Only the failure stays outstanding; the one that landed must not read as pending.
    expect(screen.getByText('1 change pending')).toBeInTheDocument();
  });
});

describe('AddQuotesToCollectionModal pending changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drops a change the user toggled back', async () => {
    renderModal('saved');

    toggleOutsider();
    expect(screen.getByText('1 change pending')).toBeInTheDocument();
    toggleOutsider();

    await waitFor(() =>
      expect(screen.getByText('Click quotes to add or remove')).toBeInTheDocument()
    );
  });
});
