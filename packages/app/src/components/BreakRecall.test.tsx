import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notDueConceptCards, setupBreakRecall } from './__fixtures__/break-recall.fixtures';
import { BreakRecall } from './BreakRecall';

vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));

const REST = <div>REST</div>;

function renderBreak() {
  return render(<BreakRecall active rest={REST} />);
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
    const cards = conceptCardFactory.buildList(3);
    setupBreakRecall({ cards });
    renderBreak();

    fireEvent.click(screen.getByRole('button', { name: 'Just rest' }));

    expect(screen.getByText('REST')).toBeInTheDocument();
    expect(screen.queryByText(cards[0].term)).not.toBeInTheDocument();
  });

  it('rests when Space is pressed after the reveal', () => {
    setupBreakRecall({ cards: conceptCardFactory.buildList(3) });
    renderBreak();
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));

    fireEvent.keyDown(document, { key: ' ' });

    expect(screen.getByText('REST')).toBeInTheDocument();
  });

  it('browses only the cards this break offers', () => {
    const cards = conceptCardFactory.buildList(5);
    setupBreakRecall({ cards });
    renderBreak();

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    }

    expect(screen.getByText(cards[0].term)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText(cards[2].term)).toBeInTheDocument();
  });

  it('grades the card on screen after browsing', async () => {
    const cards = conceptCardFactory.buildList(3);
    const { reviewCard } = setupBreakRecall({ cards });
    renderBreak();
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);

    await gradeGood();

    expect(reviewCard).toHaveBeenCalledWith(cards[1].id, 'good');
    expect(await screen.findByText(cards[0].term)).toBeInTheDocument();
    expect(screen.getByText(/2 of 3/)).toBeInTheDocument();
  });

  it('saves one review when a grade is pressed twice during the save', async () => {
    const { reviewCard } = setupBreakRecall({ cards: conceptCardFactory.buildList(3) });
    reviewCard.mockReturnValue(new Promise(() => {}));
    renderBreak();

    await gradeGood();
    fireEvent.click(screen.getByRole('button', { name: /^good/i }));

    expect(reviewCard).toHaveBeenCalledTimes(1);
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
    await waitFor(() => expect(reviewCard).toHaveBeenCalled());
    await act(async () => {});

    expect(screen.getByText(cards[0].term)).toBeInTheDocument();
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
  });

  it('keeps the card on screen while a later break reloads the deck', () => {
    const cards = conceptCardFactory.buildList(2);
    setupBreakRecall({ cards, isLoading: true });

    renderBreak();

    expect(screen.getByText(cards[0].term)).toBeInTheDocument();
  });

  it('rests while the first load is still running', () => {
    setupBreakRecall({ cards: [], isLoading: true });

    renderBreak();

    expect(screen.getByText('REST')).toBeInTheDocument();
  });

  it('rests when nothing is due', () => {
    setupBreakRecall({ cards: notDueConceptCards(2) });

    renderBreak();

    expect(screen.getByText('REST')).toBeInTheDocument();
  });

  it('shows the rest content and leaves the deck unloaded outside a break', () => {
    const { initialize } = setupBreakRecall({ cards: conceptCardFactory.buildList(3) });

    render(<BreakRecall active={false} rest={REST} />);

    expect(screen.getByText('REST')).toBeInTheDocument();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('starts each break fresh after a rest in the last one', () => {
    const cards = conceptCardFactory.buildList(3);
    setupBreakRecall({ cards });
    const { rerender } = renderBreak();
    fireEvent.click(screen.getByRole('button', { name: 'Just rest' }));

    rerender(<BreakRecall active={false} rest={REST} />);
    rerender(<BreakRecall active rest={REST} />);

    expect(screen.getByText(cards[0].term)).toBeInTheDocument();
    expect(screen.getByText(/1 of 3/)).toBeInTheDocument();
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
