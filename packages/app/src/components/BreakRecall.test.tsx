import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupBreakRecall } from './__fixtures__/break-recall.fixtures';
import { BreakRecall } from './BreakRecall';

vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));

const REST = <div>REST</div>;

function renderBreak() {
  return render(<BreakRecall rest={REST} />);
}

async function gradeGood() {
  fireEvent.click(screen.getByRole('button', { name: /reveal/i }));
  fireEvent.click(await screen.findByRole('button', { name: /^good/i }));
}

describe('BreakRecall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers the first due card, counting at most three for the break', () => {
    const cards = conceptCardFactory.buildList(5);
    setupBreakRecall({ cards });

    renderBreak();

    expect(screen.getByText(cards[0].term)).toBeInTheDocument();
    expect(screen.getByText(/1 of 3/)).toBeInTheDocument();
  });

  it('counts only the due cards when fewer than three are due', () => {
    setupBreakRecall({ cards: conceptCardFactory.buildList(2) });

    renderBreak();

    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
  });

  it('loads the deck itself, since the Pomodoro page does not', () => {
    const { initialize } = setupBreakRecall({ cards: [] });

    renderBreak();

    expect(initialize).toHaveBeenCalled();
  });

  it('shows the rest content when Just rest is chosen', () => {
    setupBreakRecall({ cards: conceptCardFactory.buildList(3) });
    renderBreak();

    fireEvent.click(screen.getByRole('button', { name: 'Just rest' }));

    expect(screen.getByText('REST')).toBeInTheDocument();
  });

  it('moves to the next card after a grade', async () => {
    const cards = conceptCardFactory.buildList(3);
    const { reviewCard } = setupBreakRecall({ cards });
    renderBreak();

    await gradeGood();

    expect(reviewCard).toHaveBeenCalledWith(cards[0].id, 'good');
    expect(await screen.findByText(cards[1].term)).toBeInTheDocument();
    expect(screen.getByText(/2 of 3/)).toBeInTheDocument();
  });

  it('returns to rest once the break cap is reached', async () => {
    setupBreakRecall({ cards: conceptCardFactory.buildList(5) });
    renderBreak();

    await gradeGood();
    await screen.findByText(/2 of 3/);
    await gradeGood();
    await screen.findByText(/3 of 3/);
    await gradeGood();

    expect(await screen.findByText('REST')).toBeInTheDocument();
  });

  it('keeps the card on screen when the review fails to save', async () => {
    const cards = conceptCardFactory.buildList(2);
    const { reviewCard } = setupBreakRecall({ cards });
    reviewCard.mockResolvedValue(false);
    renderBreak();

    await gradeGood();

    expect(await screen.findByText(cards[0].term)).toBeInTheDocument();
  });

  it('rests when nothing is due', () => {
    setupBreakRecall({
      cards: conceptCardFactory.buildList(2, {
        schedule: {
          dueDate: '2999-01-01',
          interval: 6,
          easeFactor: 2.5,
          repetitions: 2,
          lapses: 0,
        },
      }),
    });

    renderBreak();

    expect(screen.getByText('REST')).toBeInTheDocument();
  });

  it('rests when break recall is turned off', () => {
    setupBreakRecall({ cards: conceptCardFactory.buildList(3), conceptBreakRecall: false });

    renderBreak();

    expect(screen.getByText('REST')).toBeInTheDocument();
  });

  it('rests when concept cards are turned off', () => {
    setupBreakRecall({ cards: conceptCardFactory.buildList(3), conceptCardsEnabled: false });

    renderBreak();

    expect(screen.getByText('REST')).toBeInTheDocument();
  });
});
