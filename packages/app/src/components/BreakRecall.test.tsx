import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notDueConceptCards, setupBreakRecall } from './__fixtures__/break-recall.fixtures';
import { BreakRecall } from './BreakRecall';

vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));

const REST = <div>REST</div>;

interface BreakState {
  onBreak?: boolean;
  visible?: boolean;
}

function breakRecall({ onBreak = true, visible = true }: BreakState = {}) {
  return <BreakRecall onBreak={onBreak} visible={visible} rest={REST} />;
}

function renderBreak(state?: BreakState) {
  return render(breakRecall(state));
}

async function gradeGood() {
  fireEvent.click(screen.getByRole('button', { name: /reveal/i }));
  fireEvent.click(await screen.findByRole('button', { name: /^good/i }));
}

describe('BreakRecall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [5, 3],
    [2, 2],
  ])('offers the first of %i due cards, counting %i for the break', (due, counted) => {
    const cards = conceptCardFactory.buildList(due);
    setupBreakRecall({ cards });

    renderBreak();

    expect(screen.getByText(cards[0].term)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`1 of ${counted}`))).toBeInTheDocument();
  });

  it('loads the deck once across breaks', () => {
    const { initialize } = setupBreakRecall({ cards: conceptCardFactory.buildList(3) });
    const { rerender } = renderBreak();

    rerender(breakRecall({ onBreak: false }));
    rerender(breakRecall());

    expect(initialize).toHaveBeenCalledTimes(1);
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
    await act(async () => {});

    expect(screen.getByText(cards[0].term)).toBeInTheDocument();
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
  });

  it('rests when nothing is due', () => {
    setupBreakRecall({ cards: notDueConceptCards(2) });

    renderBreak();

    expect(screen.getByText('REST')).toBeInTheDocument();
  });

  it.each([
    ['outside a break', { onBreak: false }],
    ['while hidden on a narrow window', { visible: false }],
  ])('shows the rest content and leaves the deck unloaded %s', (_, state) => {
    const { initialize } = setupBreakRecall({ cards: conceptCardFactory.buildList(3) });

    renderBreak(state);

    expect(screen.getByText('REST')).toBeInTheDocument();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('starts each break fresh after a rest in the last one', () => {
    const cards = conceptCardFactory.buildList(3);
    setupBreakRecall({ cards });
    const { rerender } = renderBreak();
    fireEvent.click(screen.getByRole('button', { name: 'Just rest' }));

    rerender(breakRecall({ onBreak: false }));
    rerender(breakRecall());

    expect(screen.getByText(cards[0].term)).toBeInTheDocument();
    expect(screen.getByText(/1 of 3/)).toBeInTheDocument();
  });

  it('keeps Just rest when the window narrows and widens mid-break', () => {
    setupBreakRecall({ cards: conceptCardFactory.buildList(3) });
    const { rerender } = renderBreak();
    fireEvent.click(screen.getByRole('button', { name: 'Just rest' }));

    rerender(breakRecall({ visible: false }));
    rerender(breakRecall());

    expect(screen.getByText('REST')).toBeInTheDocument();
  });

  it('keeps the rest content mounted as a break starts with nothing due', () => {
    setupBreakRecall({ cards: notDueConceptCards(2) });
    const { rerender } = renderBreak({ onBreak: false });
    const rest = screen.getByText('REST');

    rerender(breakRecall());

    expect(screen.getByText('REST')).toBe(rest);
  });

  it.each([
    ['break recall', { conceptBreakRecall: false }],
    ['concept cards', { conceptCardsEnabled: false }],
  ])('rests when %s is turned off', (_, off) => {
    setupBreakRecall({ cards: conceptCardFactory.buildList(3), ...off });

    renderBreak();

    expect(screen.getByText('REST')).toBeInTheDocument();
  });
});
