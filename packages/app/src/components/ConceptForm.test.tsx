import { createSelectorMock } from '@cuewise/test-utils';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { ConceptForm } from './ConceptForm';

vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));

function mockStore() {
  const addCard = vi.fn().mockResolvedValue(true);
  const updateCard = vi.fn().mockResolvedValue(true);
  const deleteCard = vi.fn().mockResolvedValue(true);
  vi.mocked(useConceptCardsStore).mockImplementation(
    createSelectorMock({ addCard, updateCard, deleteCard, cards: [] })
  );
  return { addCard, updateCard, deleteCard };
}

describe('ConceptForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a concept with parsed tags', async () => {
    const { addCard } = mockStore();
    const onSuccess = vi.fn();

    render(<ConceptForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/term/i), { target: { value: 'Idempotency' } });
    fireEvent.change(screen.getByLabelText(/definition/i), { target: { value: 'Same effect.' } });
    // Tags are chips now: type then Enter to commit each.
    const tagInput = screen.getByLabelText('Tags');
    fireEvent.change(tagInput, { target: { value: 'http' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    fireEvent.change(tagInput, { target: { value: 'retries' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save concept/i }));
    });

    expect(addCard).toHaveBeenCalledWith('Idempotency', 'Same effect.', {
      details: undefined,
      tags: ['http', 'retries'],
      source: undefined,
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('folds in a tag typed but not committed when saving directly', async () => {
    const { addCard } = mockStore();

    render(<ConceptForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/term/i), { target: { value: 'Idempotency' } });
    fireEvent.change(screen.getByLabelText(/definition/i), { target: { value: 'Same effect.' } });
    // Type a tag but do NOT press Enter, then Save directly.
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'redis' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save concept/i }));
    });

    expect(addCard).toHaveBeenCalledWith(
      'Idempotency',
      'Same effect.',
      expect.objectContaining({ tags: ['redis'] })
    );
  });

  it('dedupes tags case-insensitively', async () => {
    const { addCard } = mockStore();

    render(<ConceptForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/term/i), { target: { value: 'T' } });
    fireEvent.change(screen.getByLabelText(/definition/i), { target: { value: 'D' } });
    const tagInput = screen.getByLabelText('Tags');
    fireEvent.change(tagInput, { target: { value: 'HTTP' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    fireEvent.change(tagInput, { target: { value: 'http' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save concept/i }));
    });

    expect(addCard).toHaveBeenCalledWith('T', 'D', expect.objectContaining({ tags: ['HTTP'] }));
  });

  it('deletes a concept on the second Delete click in edit mode', async () => {
    const { deleteCard } = mockStore();
    const onSuccess = vi.fn();
    const card = conceptCardFactory.build({ id: 'c9', term: 'T', definition: 'D' });

    render(<ConceptForm card={card} onSuccess={onSuccess} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(deleteCard).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));
    });

    expect(deleteCard).toHaveBeenCalledWith('c9');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('adds a concept with a source', async () => {
    const { addCard } = mockStore();

    render(<ConceptForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/term/i), { target: { value: 'CAP theorem' } });
    fireEvent.change(screen.getByLabelText(/definition/i), { target: { value: 'Pick two.' } });
    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'DDIA book' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save concept/i }));
    });

    expect(addCard).toHaveBeenCalledWith('CAP theorem', 'Pick two.', {
      details: undefined,
      tags: undefined,
      source: 'DDIA book',
    });
  });

  it('pre-fills and clears the source on edit', async () => {
    const { updateCard } = mockStore();
    const card = conceptCardFactory.build({
      id: 'c2',
      term: 'T',
      definition: 'D',
      source: 'Old source',
    });

    render(<ConceptForm card={card} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText(/source/i)).toHaveValue('Old source');
    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: '' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    // The form passes the raw cleared value; the store collapses '' -> undefined.
    expect(updateCard.mock.calls[0][1].source).toBe('');
  });

  it('edits an existing concept via updateCard', async () => {
    const { updateCard } = mockStore();
    const card = conceptCardFactory.build({ id: 'c1', term: 'Old', definition: 'Old def' });

    render(<ConceptForm card={card} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/term/i), { target: { value: 'New term' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });

    expect(updateCard).toHaveBeenCalled();
    expect(updateCard.mock.calls[0][0]).toBe('c1');
    expect(updateCard.mock.calls[0][1].term).toBe('New term');
  });

  it('disables save when a required field is blank', () => {
    mockStore();

    render(<ConceptForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: /save concept/i })).toBeDisabled();
  });
});
