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

function renderModal(outcome: Outcome) {
  const addQuoteToCollection = vi
    .fn<QuoteStore['addQuoteToCollection']>()
    .mockResolvedValue(outcome);
  const removeQuoteFromCollection = vi
    .fn<QuoteStore['removeQuoteFromCollection']>()
    .mockResolvedValue(outcome);
  vi.mocked(useQuoteStore).mockImplementation(
    createSelectorMock({
      quotes: [member, outsider],
      addQuoteToCollection,
      removeQuoteFromCollection,
    })
  );
  const onClose = vi.fn();
  render(<AddQuotesToCollectionModal collection={collection} onClose={onClose} />);
  return { onClose };
}

function toggleOutsider() {
  fireEvent.click(screen.getByRole('button', { name: /Not in yet/ }));
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
