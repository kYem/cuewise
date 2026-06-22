import { createSelectorMock } from '@cuewise/test-utils';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { useSettingsStore } from '../stores/settings-store';
import { ConceptRotation, selectSurfacedCard } from './ConceptRotation';

vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));

const dueCard = conceptCardFactory.build({
  term: 'Saga pattern',
  schedule: { dueDate: '2020-01-01', interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
});

interface SetupOptions {
  enabled?: boolean;
  framing?: 'ambient' | 'queue';
  cadence?: 'every' | 'third' | 'ten' | 'off';
  cards?: ReturnType<typeof conceptCardFactory.build>[];
}

function setup({ enabled = true, framing = 'queue', cadence = 'every', cards = [] }: SetupOptions) {
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({
      settings: {
        conceptCardsEnabled: enabled,
        conceptCadence: cadence,
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

  it('yields back to the quote after grading in ambient framing', async () => {
    setup({ framing: 'ambient', cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /good/i }));
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
    expect(screen.queryByText('Saga pattern')).not.toBeInTheDocument();
  });

  it('surfaces a concept added after a tab decided not to show one (no refresh)', () => {
    // ambient + 'off' => the tab initially surfaces no concept.
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });
    const { rerender } = render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.getByText('QUOTE')).toBeInTheDocument();

    // Adding a due card grows the deck past the decision baseline, so it surfaces
    // without a refresh.
    const added = conceptCardFactory.build({
      term: 'Just added',
      schedule: { dueDate: '2020-01-01', interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
    });
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard, added] });
    rerender(<ConceptRotation fallback={<div>QUOTE</div>} />);

    expect(screen.queryByText('QUOTE')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reveal answer/i })).toBeInTheDocument();
  });

  it('keeps the queue count in sync when a card is added', () => {
    setup({ framing: 'queue', cards: [dueCard] });
    const { rerender } = render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.getByText(/Card 1 of 1/)).toBeInTheDocument();

    const added = conceptCardFactory.build({
      term: 'Just added',
      schedule: { dueDate: '2020-01-01', interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
    });
    setup({ framing: 'queue', cards: [dueCard, added] });
    rerender(<ConceptRotation fallback={<div>QUOTE</div>} />);

    expect(screen.getByText(/Card 1 of 2/)).toBeInTheDocument();
  });

  it('browses to the next due card with the toolbar', () => {
    const cardA = conceptCardFactory.build({
      id: 'a',
      term: 'Card A',
      schedule: { dueDate: '2020-01-01', interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
    });
    const cardB = conceptCardFactory.build({
      id: 'b',
      term: 'Card B',
      schedule: { dueDate: '2020-01-02', interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
    });
    setup({ framing: 'queue', cards: [cardA, cardB] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.getByText('Card A')).toBeInTheDocument();
    expect(screen.getByText(/Card 1 of 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Card B')).toBeInTheDocument();
    expect(screen.getByText(/Card 2 of 2/)).toBeInTheDocument();
  });

  it('clears the queue once the only due card is graded', async () => {
    setup({ framing: 'queue', cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /good/i }));
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
  });
});

describe('selectSurfacedCard', () => {
  const a = conceptCardFactory.build({ id: 'a' });
  const b = conceptCardFactory.build({ id: 'b' });
  const c = conceptCardFactory.build({ id: 'c' });

  it('returns no card before a decision is made', () => {
    expect(selectSurfacedCard([a, b], null, 0).current).toBeUndefined();
  });

  it('browses the whole due pile when surfacing is on, wrapping the index', () => {
    const decision = { show: true, knownIds: ['a', 'b'] };
    expect(selectSurfacedCard([a, b], decision, 0)).toEqual({ current: a, position: 0 });
    expect(selectSurfacedCard([a, b], decision, 1)).toEqual({ current: b, position: 1 });
    expect(selectSurfacedCard([a, b], decision, 2)).toEqual({ current: a, position: 0 });
    expect(selectSurfacedCard([a, b], decision, -1)).toEqual({ current: b, position: 1 });
  });

  it('surfaces only cards added since the decision when surfacing is off', () => {
    // a and b were known at decision time; c was added during the tab.
    const decision = { show: false, knownIds: ['a', 'b'] };
    expect(selectSurfacedCard([a, b, c], decision, 0)).toEqual({ current: c, position: 0 });
    expect(selectSurfacedCard([a, b], decision, 0).current).toBeUndefined();
  });
});
