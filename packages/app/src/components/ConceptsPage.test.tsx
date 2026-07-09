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

  it('shows the scheduled date and review count for a not-due card', () => {
    mockStore([
      conceptCardFactory.build({
        term: 'Later card',
        schedule: {
          dueDate: '2099-01-01',
          interval: 12,
          easeFactor: 2.5,
          repetitions: 4,
          lapses: 0,
          lastReviewedAt: '2026-06-10T00:00:00.000Z',
        },
      }),
    ]);

    render(<ConceptsPage />);

    expect(screen.getByText('Due 2099-01-01')).toBeInTheDocument();
    expect(screen.getByText(/4 reviews .* interval 12d/)).toBeInTheDocument();
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

    // Opening the editor disarms the card's pending delete.
    expect(screen.queryByRole('button', { name: 'Click again to delete' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('tints each card by its difficulty level', () => {
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
      conceptCardFactory.build({
        term: 'Solid card',
        schedule: {
          dueDate: '2099-01-01',
          interval: 12,
          easeFactor: 2.3,
          repetitions: 3,
          lapses: 1,
          lastReviewedAt: '2026-06-10T00:00:00.000Z',
        },
      }),
      conceptCardFactory.build({
        term: 'Strong card',
        schedule: {
          dueDate: '2099-01-01',
          interval: 40,
          easeFactor: 2.6,
          repetitions: 6,
          lapses: 0,
          lastReviewedAt: '2026-06-10T00:00:00.000Z',
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

    const solid = screen.getByText('Solid card').closest('li');
    expect(solid).not.toBeNull();
    expect(solid).toHaveClass('border-l-warning');

    const strong = screen.getByText('Strong card').closest('li');
    expect(strong).not.toBeNull();
    expect(strong).toHaveClass('border-l-success');
  });

  it('filters the list by search query', () => {
    mockStore([
      conceptCardFactory.build({ term: 'Saga pattern', definition: 'compensating txns' }),
      conceptCardFactory.build({ term: 'Idempotency', definition: 'same effect' }),
    ]);

    render(<ConceptsPage />);
    fireEvent.change(screen.getByLabelText('Search concepts'), { target: { value: 'saga' } });

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.queryByText('Idempotency')).toBeNull();

    // also matches on the definition text
    fireEvent.change(screen.getByLabelText('Search concepts'), {
      target: { value: 'compensating' },
    });
    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.queryByText('Idempotency')).toBeNull();
  });

  it('matches search on the source field', () => {
    mockStore([
      conceptCardFactory.build({ term: 'CAP theorem', source: 'DDIA book' }),
      conceptCardFactory.build({ term: 'Idempotency' }),
    ]);

    render(<ConceptsPage />);
    fireEvent.change(screen.getByLabelText('Search concepts'), { target: { value: 'ddia' } });

    expect(screen.getByText('CAP theorem')).toBeInTheDocument();
    expect(screen.queryByText('Idempotency')).toBeNull();
  });

  it('combines search and tag filter with AND', () => {
    mockStore([
      conceptCardFactory.build({ term: 'Saga pattern', tags: ['microservices'] }),
      conceptCardFactory.build({ term: 'Sidecar', tags: ['microservices'] }),
      conceptCardFactory.build({ term: 'Saga timeout', tags: ['http'] }),
    ]);

    render(<ConceptsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'microservices' }));
    fireEvent.change(screen.getByLabelText('Search concepts'), { target: { value: 'saga' } });

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.queryByText('Sidecar')).toBeNull(); // right tag, wrong query
    expect(screen.queryByText('Saga timeout')).toBeNull(); // right query, wrong tag
  });

  it('filters by a tag chip and toggles it off', () => {
    mockStore([
      conceptCardFactory.build({ term: 'Saga pattern', tags: ['microservices'] }),
      conceptCardFactory.build({ term: 'Idempotency', tags: ['http'] }),
    ]);

    render(<ConceptsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'microservices' }));

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.queryByText('Idempotency')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'microservices' }));
    expect(screen.getByText('Idempotency')).toBeInTheDocument();
  });

  it('shows a no-match message when nothing matches', () => {
    mockStore([conceptCardFactory.build({ term: 'Saga pattern' })]);

    render(<ConceptsPage />);
    fireEvent.change(screen.getByLabelText('Search concepts'), {
      target: { value: 'zzz nonexistent' },
    });

    expect(screen.getByText(/no concepts match/i)).toBeInTheDocument();
    expect(screen.queryByText('Saga pattern')).toBeNull();
  });
});
