import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeApi,
  type FakeCaptureApi,
  GLOSSARY_DRAFT,
  lastPersistedDraft,
  QUOTE_DRAFT,
  UNSCRIPTABLE_DRAFT,
} from './__fixtures__/capture-popup.fixtures';
import { CapturePopup, CLOSE_AFTER_SAVE_MS, DRAFT_WRITE_DELAY_MS } from './CapturePopup';

async function renderPopup(api: FakeCaptureApi) {
  render(<CapturePopup api={api} />);
  await screen.findByRole('button', { name: 'Save' });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CapturePopup', () => {
  it('fills the concept fields from the selection', async () => {
    await renderPopup(createFakeApi());

    expect(screen.getByLabelText('Term')).toHaveValue('Idempotence');
    expect(screen.getByLabelText('Definition')).toHaveValue(
      'Same effect however many times it runs.'
    );
  });

  it('selects an inferred term, so typing replaces it', async () => {
    await renderPopup(createFakeApi());
    const term = screen.getByLabelText<HTMLInputElement>('Term');

    expect(term).toHaveFocus();
    expect(term.value.slice(term.selectionStart ?? 0, term.selectionEnd ?? 0)).toBe('Idempotence');
  });

  it('names the page the selection came from', async () => {
    await renderPopup(createFakeApi());

    expect(screen.getByText('From: Glossary · example.com')).toBeInTheDocument();
  });

  it('opens a quote draft on the quote fields, focused on the author', async () => {
    await renderPopup(createFakeApi(QUOTE_DRAFT));

    expect(screen.getByLabelText('Quote')).toHaveValue(
      'Be yourself; everyone else is already taken.'
    );
    expect(screen.getByLabelText('Author')).toHaveValue('Oscar Wilde');
    expect(screen.getByLabelText('Author')).toHaveFocus();
  });

  it('switches kind with the segmented control', async () => {
    const user = userEvent.setup();
    await renderPopup(createFakeApi());

    await user.click(screen.getByRole('button', { name: 'Quote' }));

    expect(screen.getByRole('button', { name: 'Quote' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Quote')).toBeInTheDocument();
  });

  it('starts empty and without an error on a page it could not read', async () => {
    await renderPopup(createFakeApi(UNSCRIPTABLE_DRAFT));

    expect(screen.getByLabelText('Term')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('writes edits back to the draft once typing pauses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = createFakeApi();
    await renderPopup(api);

    await user.keyboard('Idempotency');
    expect(api.persistDraft).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(DRAFT_WRITE_DELAY_MS));

    expect(api.persistDraft).toHaveBeenCalledTimes(1);
    expect(lastPersistedDraft(api)).toMatchObject({ kind: 'concept', term: 'Idempotency' });
  });

  it('sends the edited fields to be saved', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    await renderPopup(api);

    await user.keyboard('Idempotency');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.save).toHaveBeenCalledWith({
      ...GLOSSARY_DRAFT,
      term: 'Idempotency',
      definition: 'Same effect however many times it runs.',
      quoteText: 'Idempotence\nSame effect however many times it runs.',
      author: '',
    });
  });

  it('saves on Enter in a single-line field', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    await renderPopup(api);

    await user.type(screen.getByLabelText('Term'), '{Enter}');

    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it('does not let a pending draft write land after the save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = createFakeApi();
    await renderPopup(api);

    await user.type(screen.getByLabelText('Term'), 'X{Enter}');
    await act(() => vi.advanceTimersByTimeAsync(DRAFT_WRITE_DELAY_MS * 2));

    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.persistDraft).not.toHaveBeenCalled();
  });

  it('refuses a concept with no term before sending it', async () => {
    const user = userEvent.setup();
    const api = createFakeApi(UNSCRIPTABLE_DRAFT);
    await renderPopup(api);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Add a term and a definition first.');
    expect(api.save).not.toHaveBeenCalled();
  });

  it('shows Saved, then closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = createFakeApi();
    await renderPopup(api);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeDisabled();
    expect(api.close).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(CLOSE_AFTER_SAVE_MS));
    expect(api.close).toHaveBeenCalled();
  });

  it('explains a failed save under the button and keeps the fields for a retry', async () => {
    const user = userEvent.setup();
    const api = createFakeApi(GLOSSARY_DRAFT, {
      ok: false,
      reason: 'Storage is full. Free up some space to continue.',
    });
    await renderPopup(api);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is full.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByLabelText('Term')).toHaveValue('Idempotence');
    await waitFor(() => expect(api.persistDraft).toHaveBeenCalled());
    expect(api.close).not.toHaveBeenCalled();
  });

  it('explains a save the service worker never answered', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    api.save.mockRejectedValue(new Error('Receiving end does not exist.'));
    await renderPopup(api);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save.');
  });
});
