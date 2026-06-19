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

  it('shows the due headline and deck composition for a deck', () => {
    setup([
      conceptCardFactory.build({
        schedule: {
          dueDate: '2020-01-01',
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lapses: 0,
        },
      }),
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
  });

  it('renders an empty state when there are no cards', () => {
    setup([]);

    render(<ConceptInsights />);

    expect(screen.getByText(/no concept cards/i)).toBeInTheDocument();
  });
});
