import { createSelectorMock } from '@cuewise/test-utils';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { useSettingsStore } from '../stores/settings-store';
import { ConceptRotation } from './ConceptRotation';

vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));

const dueCard = conceptCardFactory.build({
  term: 'Saga pattern',
  schedule: { dueDate: '2020-01-01', interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
});

interface SetupOptions {
  enabled?: boolean;
  framing?: 'ambient' | 'queue';
  cards?: ReturnType<typeof conceptCardFactory.build>[];
}

function setup({ enabled = true, framing = 'queue', cards = [] }: SetupOptions) {
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({
      settings: {
        conceptCardsEnabled: enabled,
        conceptCadence: 'every',
        conceptFraming: framing,
        conceptActiveRecall: true,
      },
    })
  );
  const reviewCard = vi.fn().mockResolvedValue(true);
  vi.mocked(useConceptCardsStore).mockImplementation(
    createSelectorMock({ cards, isLoading: false, initialize: vi.fn(), reviewCard })
  );
  return { reviewCard };
}

describe('ConceptRotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the fallback when the feature is disabled', () => {
    setup({ enabled: false, cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
  });

  it('renders the fallback when nothing is due', () => {
    setup({ cards: [] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
  });

  it('surfaces a due concept in queue framing', () => {
    setup({ framing: 'queue', cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.queryByText('QUOTE')).not.toBeInTheDocument();
  });

  it('reviews the card when graded', () => {
    const { reviewCard } = setup({ framing: 'queue', cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole('button', { name: /good/i }));

    expect(reviewCard).toHaveBeenCalledWith(dueCard.id, 'good');
  });
});
