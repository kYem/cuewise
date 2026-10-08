import { createSelectorMock } from '@cuewise/test-utils';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  liveIds,
  RunButton,
  renderWithLiveIds,
  renderWithShortcuts,
} from '../shortcuts/__fixtures__/shortcuts.fixtures';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { ConceptRotation, selectSurfacedCard } from './ConceptRotation';
import { Modal } from './Modal';

vi.mock('../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));
vi.mock('../stores/quote-store', () => ({ useQuoteStore: vi.fn() }));

const dueCard = conceptCardFactory.build({
  term: 'Saga pattern',
  schedule: { dueDate: '2020-01-01', interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
});

interface SetupOptions {
  enabled?: boolean;
  framing?: 'ambient' | 'queue';
  cadence?: 'every' | 'third' | 'ten' | 'off';
  cards?: ReturnType<typeof conceptCardFactory.build>[];
  isLoading?: boolean;
}

/** A quote on screen with a due concept waiting, plus a button that runs `concept.show`. */
const WaitingConcept: React.FC = () => (
  <>
    <ConceptRotation fallback={<div>QUOTE</div>} />
    <RunButton id="concept.show" />
  </>
);

function setup({
  enabled = true,
  framing = 'queue',
  cadence = 'every',
  cards = [],
  isLoading = false,
}: SetupOptions) {
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
    createSelectorMock({ cards, isLoading, initialize: vi.fn(), reviewCard })
  );
  // clearAllMocks does not strip a plain assigned property, so every test gets its own.
  const refreshQuote = vi.fn();
  Object.assign(useQuoteStore, { getState: () => ({ refreshQuote }) });
  return { reviewCard, refreshQuote };
}

describe('ConceptRotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
  });

  it('offers the due concept to the palette while a quote shows', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });
    renderWithLiveIds(<WaitingConcept />);
    expect(liveIds()).toHaveTextContent('concept.show');

    fireEvent.click(screen.getByRole('button', { name: 'run concept.show' }));

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
  });

  it('stops offering the due concept once it is on screen', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });
    renderWithLiveIds(<WaitingConcept />);

    fireEvent.click(screen.getByRole('button', { name: 'run concept.show' }));

    expect(liveIds()).not.toHaveTextContent('concept.show');
  });

  it.each([
    ['nothing is due', { cards: [] }],
    ['concepts are off', { enabled: false, cards: [dueCard] }],
    ['cards are still loading', { isLoading: true, cards: [dueCard] }],
  ])('offers no due concept when %s', (_state, options) => {
    setup({ framing: 'ambient', cadence: 'off', ...options });
    renderWithLiveIds(<ConceptRotation fallback={<div>QUOTE</div>} />);

    expect(liveIds()).not.toHaveTextContent('concept.show');
  });

  it('keeps c for the concept slot with the shortcuts mounted', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });
    renderWithShortcuts(<ConceptRotation fallback={<div>QUOTE</div>} />);

    fireEvent.keyDown(document.body, { key: 'c' });

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
  });

  it('keeps g then c on navigation, leaving the concept slot alone', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });
    renderWithShortcuts(<ConceptRotation fallback={<div>QUOTE</div>} />);

    fireEvent.keyDown(document.body, { key: 'g' });
    fireEvent.keyDown(document.body, { key: 'c' });

    expect(window.location.hash).toBe('#concepts');
    expect(screen.queryByText('Saga pattern')).not.toBeInTheDocument();
    expect(screen.getByText('QUOTE')).toBeInTheDocument();
  });

  it('offers New quote while a card is up, leaving it the way space does', () => {
    const { refreshQuote } = setup({ framing: 'queue', cards: [dueCard] });
    const onManualRefresh = vi.fn();
    renderWithShortcuts(
      <>
        <ConceptRotation fallback={<div>QUOTE</div>} onManualRefresh={onManualRefresh} />
        <RunButton id="quote.next" />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: 'run quote.next' }));

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
    expect(refreshQuote).toHaveBeenCalledWith({ userInitiated: true });
    expect(onManualRefresh).toHaveBeenCalledTimes(1);
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

  it('leaves the card for a fresh quote when space follows the reveal', async () => {
    const { refreshQuote } = setup({ framing: 'queue', cards: [dueCard] });
    const onManualRefresh = vi.fn();

    render(<ConceptRotation fallback={<div>QUOTE</div>} onManualRefresh={onManualRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }));
    await act(async () => {
      fireEvent.keyDown(document.body, { key: ' ' });
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
    expect(refreshQuote).toHaveBeenCalledTimes(1);
    // A keypress, so a lost card write is worth reporting; the rotation tick's is not.
    expect(refreshQuote).toHaveBeenCalledWith({ userInitiated: true });
    // Without this the host's rotation keeps its phase and overwrites the quote just asked for.
    expect(onManualRefresh).toHaveBeenCalledTimes(1);
  });

  it('still leaves for the quote when a card was added during the tab', async () => {
    // A card added after the surfacing decision is not in knownIds, so clearing
    // decision.show alone keeps surfacing it and space would look dead.
    const added = conceptCardFactory.build({
      term: 'Added mid-tab',
      schedule: { dueDate: '2020-01-01', interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
    });
    setup({ framing: 'queue', cards: [dueCard] });
    const { rerender } = render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    setup({ framing: 'queue', cards: [dueCard, added] });
    rerender(<ConceptRotation fallback={<div>QUOTE</div>} />);

    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }));
    await act(async () => {
      fireEvent.keyDown(document.body, { key: ' ' });
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
    expect(screen.queryByText('Added mid-tab')).not.toBeInTheDocument();
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

  it('surfaces a due card when the shortcut is pressed on a quote', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.getByText('QUOTE')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.queryByText('QUOTE')).not.toBeInTheDocument();
  });

  it('returns to the quote when the shortcut is pressed on a card', () => {
    setup({ framing: 'queue', cadence: 'every', cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.getByText('Saga pattern')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
    expect(screen.queryByText('Saga pattern')).not.toBeInTheDocument();
  });

  it('returns to the quote from a card added during the tab', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });
    const { rerender } = render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.getByText('QUOTE')).toBeInTheDocument();

    const added = conceptCardFactory.build({
      term: 'Just added',
      schedule: { dueDate: '2020-01-01', interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0 },
    });
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard, added] });
    rerender(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.queryByText('QUOTE')).not.toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
  });

  it('toggles back to the card on a second press', () => {
    setup({ framing: 'queue', cadence: 'every', cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);

    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });
    expect(screen.getByText('QUOTE')).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
  });

  it('ignores an auto-repeat of the shortcut, so holding the key does not strobe the slot', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);

    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });
    act(() => {
      fireEvent.keyDown(document.body, { key: 'c', repeat: true });
    });

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
  });

  it('returns to the quote after grading, not the next due card, once toggled onto a card', async () => {
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
    setup({ framing: 'ambient', cadence: 'off', cards: [cardA, cardB] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.getByText('QUOTE')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });
    expect(screen.getByText('Card A')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /good/i }));
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
    expect(screen.queryByText('Card B')).not.toBeInTheDocument();
  });

  it('ignores the shortcut when nothing is due', () => {
    setup({ cards: [] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);

    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
  });

  it('ignores the shortcut when concepts are disabled', () => {
    setup({ enabled: false, cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);

    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
  });

  it('ignores the shortcut while typing in a text field', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });

    render(
      <>
        <input aria-label="note" />
        <ConceptRotation fallback={<div>QUOTE</div>} />
      </>
    );

    act(() => {
      fireEvent.keyDown(screen.getByLabelText('note'), { key: 'c' });
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
  });

  it('ignores the shortcut while a modal dialog is open', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });

    render(
      <>
        <div role="dialog" aria-modal="true">
          Settings
        </div>
        <ConceptRotation fallback={<div>QUOTE</div>} />
      </>
    );

    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
  });

  it('ignores the shortcut while the real Add Concept modal is open', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });

    render(
      <>
        <Modal isOpen onClose={() => {}} title="Add a concept">
          <button type="button">Save</button>
        </Modal>
        <ConceptRotation fallback={<div>QUOTE</div>} />
      </>
    );

    act(() => {
      fireEvent.keyDown(document.body, { key: 'c' });
    });

    expect(screen.getByText('QUOTE')).toBeInTheDocument();
  });

  it('toggles the slot on Shift+C', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.getByText('QUOTE')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'C', shiftKey: true });
    });

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.queryByText('QUOTE')).not.toBeInTheDocument();
  });

  it('toggles the slot on a Caps-Lock-shifted "C" without the Shift modifier', () => {
    setup({ framing: 'ambient', cadence: 'off', cards: [dueCard] });

    render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.getByText('QUOTE')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'C' });
    });

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.queryByText('QUOTE')).not.toBeInTheDocument();
  });
});

describe('a deck that changes while a card is on screen', () => {
  const overdue = {
    dueDate: '2020-01-01',
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
  };
  const reading = conceptCardFactory.build({
    id: 'reading',
    term: 'Saga pattern',
    schedule: overdue,
  });
  const arriving = conceptCardFactory.build({
    id: 'arriving',
    term: 'Idempotence',
    schedule: overdue,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the card when another realm adds one ahead of it', () => {
    setup({ cards: [reading] });
    const { rerender } = render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    expect(screen.getByText('Saga pattern')).toBeInTheDocument();

    // A capture from a page, or another tab: the new card lands first in the deck.
    setup({ cards: [arriving, reading] });
    rerender(<ConceptRotation fallback={<div>QUOTE</div>} />);

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
  });

  it('keeps the card when another realm removes one ahead of it', () => {
    const second = conceptCardFactory.build({
      id: 'second',
      term: 'Backpressure',
      schedule: overdue,
    });
    setup({ cards: [arriving, second, reading] });
    const { rerender } = render(<ConceptRotation fallback={<div>QUOTE</div>} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Saga pattern')).toBeInTheDocument();

    // Graded on another device: the deck shrinks ahead of the reader, so position 2 would wrap.
    setup({ cards: [second, reading] });
    rerender(<ConceptRotation fallback={<div>QUOTE</div>} />);

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
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

  // The deck changes under a reader whenever another realm writes — another tab, a capture from
  // a page, a sync pull. Picking by position alone would hand them a different card mid-read.
  describe('anchored to the card on screen', () => {
    const decision = { show: true, knownIds: ['a'] };

    it('keeps the anchored card when a card arrives from elsewhere', () => {
      expect(selectSurfacedCard([a], decision, 0, 'a')).toEqual({ current: a, position: 0 });
      // b lands first in the deck; without the anchor `0 % 2` would now be b.
      expect(selectSurfacedCard([b, a], decision, 0, 'a')).toEqual({ current: a, position: 1 });
    });

    it('keeps the anchored card when another card leaves the deck', () => {
      expect(selectSurfacedCard([a, b, c], decision, 2, 'c')).toEqual({ current: c, position: 2 });
      expect(selectSurfacedCard([a, c], decision, 2, 'c')).toEqual({ current: c, position: 1 });
    });

    it('falls back to the browse index once the anchored card has gone', () => {
      expect(selectSurfacedCard([a, b], decision, 1, 'missing')).toEqual({
        current: b,
        position: 1,
      });
    });

    it('ignores an anchor the deck hides, so surfacing rules still win', () => {
      const off = { show: false, knownIds: ['a', 'b'] };
      expect(selectSurfacedCard([a, b, c], off, 0, 'a')).toEqual({ current: c, position: 0 });
    });
  });
});
