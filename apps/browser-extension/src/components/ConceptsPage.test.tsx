import { createSelectorMock } from '@cuewise/test-utils';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { ConceptsPage } from './ConceptsPage';

vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));

function mockStore(cards: ReturnType<typeof conceptCardFactory.build>[]) {
  const deleteCard = vi.fn().mockResolvedValue(true);
  vi.mocked(useConceptCardsStore).mockImplementation(
    createSelectorMock({
      cards,
      isLoading: false,
      initialize: vi.fn(),
      deleteCard,
      addCard: vi.fn().mockResolvedValue(true),
      updateCard: vi.fn().mockResolvedValue(true),
    })
  );
  return { deleteCard };
}

const dueCard = conceptCardFactory.build({
  id: '1',
  term: 'Saga pattern',
  schedule: { dueDate: '2020-01-01', interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
});

describe('ConceptsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no cards', () => {
    mockStore([]);

    render(<ConceptsPage />);

    expect(screen.getByText('No concepts yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add your first concept/i })).toBeInTheDocument();
  });

  it('lists a card with its term and due badge', () => {
    mockStore([dueCard]);

    render(<ConceptsPage />);

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.getByText('Due now')).toBeInTheDocument();
  });

  it('requires two clicks to delete', () => {
    const { deleteCard } = mockStore([dueCard]);

    render(<ConceptsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteCard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Click again to delete' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Click again to delete' }));
    expect(deleteCard).toHaveBeenCalledWith('1');
  });

  it('disarms a pending delete when the card is edited', () => {
    mockStore([dueCard]);

    render(<ConceptsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'Click again to delete' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.queryByRole('button', { name: 'Click again to delete' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('tints a struggling card and leaves a new card unaccented', () => {
    mockStore([
      conceptCardFactory.build({
        term: 'Struggling card',
        schedule: {
          dueDate: '2099-01-01',
          interval: 5,
          easeFactor: 1.6,
          repetitions: 2,
          lapses: 3,
          lastReviewedAt: '2026-06-10T00:00:00.000Z',
        },
      }),
      conceptCardFactory.build({
        term: 'Fresh card',
        schedule: {
          dueDate: '2099-01-01',
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lapses: 0,
        },
      }),
    ]);

    render(<ConceptsPage />);

    const struggling = screen.getByText('Struggling card').closest('li');
    expect(struggling).not.toBeNull();
    expect(struggling).toHaveClass('border-l-error');

    const fresh = screen.getByText('Fresh card').closest('li');
    expect(fresh).not.toBeNull();
    expect(fresh).not.toHaveClass('border-l-error');
  });
});
