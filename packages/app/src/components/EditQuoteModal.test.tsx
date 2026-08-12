import { createSelectorMock } from '@cuewise/test-utils';
import { quoteFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuoteStore } from '../stores/quote-store';
import { EditQuoteModal } from './EditQuoteModal';

vi.mock('../stores/quote-store', () => ({
  useQuoteStore: vi.fn(),
}));

const existing = quoteFactory.build({ id: 'q1', text: 'Original', isCustom: true });

type QuoteStore = ReturnType<typeof useQuoteStore.getState>;
type Outcome = Awaited<ReturnType<QuoteStore['editQuote']>>;

function renderModal(outcome: Outcome) {
  vi.mocked(useQuoteStore).mockImplementation(createSelectorMock({ quotes: [existing] }));
  const onSave = vi.fn<QuoteStore['editQuote']>().mockResolvedValue(outcome);
  const onClose = vi.fn();
  render(<EditQuoteModal quote={existing} onClose={onClose} onSave={onSave} />);
  return { onClose };
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

describe('EditQuoteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes once the edit is saved', async () => {
    const { onClose } = renderModal('saved');

    save();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // The store has already warned, and a retry can only fail the same way.
  it('closes when the pull deleted the quote first', async () => {
    const { onClose } = renderModal('gone');

    save();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  // Closing here would discard what the user typed on a write they can retry.
  it('stays open when the write did not persist', async () => {
    const { onClose } = renderModal('failed');

    save();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
