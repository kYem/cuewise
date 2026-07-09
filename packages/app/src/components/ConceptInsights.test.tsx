import { createSelectorMock } from '@cuewise/test-utils';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { ConceptInsights } from './ConceptInsights';

vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));

function setup(cards: ReturnType<typeof conceptCardFactory.build>[]) {
  vi.mocked(useConceptCardsStore).mockImplementation(
    createSelectorMock({ cards, initialize: vi.fn() })
  );
}

describe('ConceptInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders computed stats, not just labels', () => {
    setup([
      // overdue + never reviewed -> counts toward `due` and New
      conceptCardFactory.build({
        schedule: {
          dueDate: '2020-01-01',
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lapses: 0,
        },
      }),
      // reviewed, mastered, ease 2.6, never lapsed -> retention 100%, avg ease 2.60
      conceptCardFactory.build({
        schedule: {
          dueDate: '2099-01-01',
          interval: 40,
          easeFactor: 2.6,
          repetitions: 5,
          lapses: 0,
          lastReviewedAt: '2026-06-10T00:00:00.000Z',
        },
      }),
    ]);

    render(<ConceptInsights />);

    expect(screen.getByText('Due now')).toBeInTheDocument();
    expect(screen.getByText('Mastered')).toBeInTheDocument();
    // computed values, not the hard-coded labels
    expect(screen.getByText('100%')).toBeInTheDocument(); // retention: 1/1 reviewed never lapsed
    expect(screen.getByText('2.60')).toBeInTheDocument(); // avg ease over the one reviewed card
  });

  it('shows an em dash for retention and ease when nothing is reviewed', () => {
    setup([
      conceptCardFactory.build({
        schedule: {
          dueDate: '2099-01-01',
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lapses: 0,
        },
      }),
    ]);

    render(<ConceptInsights />);

    expect(screen.getAllByText('—')).toHaveLength(2); // retention + avg ease both null
  });

  it('lists struggling cards in needs-attention', () => {
    setup([
      conceptCardFactory.build({
        term: 'Hard concept',
        schedule: {
          dueDate: '2099-01-01',
          interval: 5,
          easeFactor: 1.6,
          repetitions: 1,
          lapses: 3,
          lastReviewedAt: '2026-06-10T00:00:00.000Z',
        },
      }),
    ]);

    render(<ConceptInsights />);

    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Hard concept')).toBeInTheDocument();
    expect(screen.getByText('3 lapses')).toBeInTheDocument();
  });

  it('renders an empty state when there are no cards', () => {
    setup([]);

    render(<ConceptInsights />);

    expect(screen.getByText(/no concept cards/i)).toBeInTheDocument();
  });
});
