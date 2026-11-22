import { CONCEPT_BREAK_RECALL_MAX, type ConceptGrade, getDueConceptCards } from '@cuewise/shared';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { useSettingsStore } from '../stores/settings-store';
import { ConceptCardDisplay } from './ConceptCardDisplay';

interface BreakRecallProps {
  /** A Pomodoro break is on; each switch to true starts a fresh cap and clears "Just rest". */
  onBreak: boolean;
  /** The companion column is on screen; a hidden card would still grab Space and 1/2/3. */
  visible: boolean;
  /** The usual companion, shown whenever no card is on offer. */
  rest: React.ReactNode;
}

interface BreakRound {
  handledIds: string[];
  rested: boolean;
  position: number;
}

const FRESH_ROUND: BreakRound = { handledIds: [], rested: false, position: 0 };

// Fixed at the quote's full width (max-w-2xl): the companion column shrinks to its content,
// so a short term would otherwise pull the card up against the timer.
const BREAK_CARD_LAYOUT = 'flex w-[42rem] max-w-full flex-col items-center gap-density-md';

/**
 * Offers a few due concept cards beside the timer during a Pomodoro break. Always rendered, so
 * the companion keeps its place in the tree (and its quote timer) across break transitions.
 */
export const BreakRecall: React.FC<BreakRecallProps> = ({ onBreak, visible, rest }) => {
  const enabled = useSettingsStore(
    (state) => state.settings.conceptCardsEnabled && state.settings.conceptBreakRecall
  );
  const activeRecall = useSettingsStore((state) => state.settings.conceptActiveRecall);

  const cards = useConceptCardsStore((state) => state.cards);
  const initialize = useConceptCardsStore((state) => state.initialize);
  const reviewCard = useConceptCardsStore((state) => state.reviewCard);
  const toggleFavorite = useConceptCardsStore((state) => state.toggleFavorite);

  const [round, setRound] = useState(FRESH_ROUND);
  const [grading, setGrading] = useState(false);
  const [wasOnBreak, setWasOnBreak] = useState(onBreak);
  const loaded = useRef(false);
  const active = enabled && onBreak && visible;

  if (onBreak !== wasOnBreak) {
    setWasOnBreak(onBreak);
    if (onBreak) {
      setRound(FRESH_ROUND);
    }
  }

  // One load is enough: initialize subscribes the store to storage changes from then on.
  useEffect(() => {
    if (active && !loaded.current) {
      loaded.current = true;
      initialize();
    }
  }, [active, initialize]);

  const { handledIds, rested, position } = round;
  const deck = useMemo(() => {
    if (!active) {
      return [];
    }
    const due = getDueConceptCards(cards, new Date()).filter(
      (card) => !handledIds.includes(card.id)
    );
    return due.slice(0, CONCEPT_BREAK_RECALL_MAX - handledIds.length);
  }, [active, cards, handledIds]);

  if (rested || deck.length === 0) {
    return <>{rest}</>;
  }

  const current = deck[position % deck.length];
  const takeRest = () => setRound((r) => ({ ...r, rested: true }));
  // Only kept non-negative here; the % at read time wraps it, even if the deck shrinks.
  const moveBy = (delta: number) => {
    setRound((r) => ({ ...r, position: (r.position % deck.length) + delta + deck.length }));
  };

  const handleGrade = async (grade: ConceptGrade) => {
    if (grading) {
      return;
    }
    setGrading(true);
    const ok = await reviewCard(current.id, grade);
    setGrading(false);
    if (!ok) {
      return;
    }
    setRound((r) => ({ ...r, handledIds: [...r.handledIds, current.id], position: 0 }));
  };

  return (
    <div className={BREAK_CARD_LAYOUT}>
      <ConceptCardDisplay
        key={current.id}
        card={current}
        activeRecall={activeRecall}
        onGrade={handleGrade}
        onPrev={() => moveBy(-1)}
        onNext={() => moveBy(1)}
        isFavorite={current.isFavorite ?? false}
        onToggleFavorite={() => toggleFavorite(current.id)}
        dueCount={deck.length}
        queueLabel={`Break recall ${handledIds.length + 1} of ${handledIds.length + deck.length}`}
        onSkipToQuote={takeRest}
      />
      <button
        type="button"
        onClick={takeRest}
        className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-variant hover:text-primary"
      >
        Just rest
      </button>
    </div>
  );
};
