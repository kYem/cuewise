import { createSelectorMock } from '@cuewise/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuoteStore } from '../stores/quote-store';
import { AddQuoteForm } from './AddQuoteForm';

vi.mock('../stores/quote-store', () => ({
  useQuoteStore: vi.fn(),
}));

type QuoteStore = ReturnType<typeof useQuoteStore.getState>;

function renderForm(saved: boolean) {
  const addCustomQuote = vi.fn<QuoteStore['addCustomQuote']>().mockResolvedValue(saved);
  vi.mocked(useQuoteStore).mockImplementation(createSelectorMock({ quotes: [], addCustomQuote }));
  const onSuccess = vi.fn();
  render(<AddQuoteForm onSuccess={onSuccess} onCancel={vi.fn()} />);
  return { onSuccess };
}

function fillAndSubmit(): void {
  fireEvent.change(screen.getByPlaceholderText('Enter the quote...'), {
    target: { value: 'The obstacle is the way' },
  });
  fireEvent.change(screen.getByPlaceholderText('Who said this?'), {
    target: { value: 'Marcus Aurelius' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add Quote' }));
}

describe('AddQuoteForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears the fields and closes once the quote is saved', async () => {
    const { onSuccess } = renderForm(true);

    fillAndSubmit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('Enter the quote...')).toHaveValue('');
  });

  // The whole reason addCustomQuote reports its outcome: clearing here would throw away
  // everything the user typed on a write they can retry.
  it('keeps what the user typed when the write did not persist', async () => {
    const { onSuccess } = renderForm(false);

    fillAndSubmit();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Quote' })).toBeEnabled());
    expect(screen.getByPlaceholderText('Enter the quote...')).toHaveValue(
      'The obstacle is the way'
    );
    expect(screen.getByPlaceholderText('Who said this?')).toHaveValue('Marcus Aurelius');
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
