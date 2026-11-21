import { CONCEPT_BREAK_RECALL_MAX, type ConceptGrade, getDueConceptCards } from '@cuewise/shared';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { useSettingsStore } from '../stores/settings-store';
import { ConceptCardDisplay } from './ConceptCardDisplay';

interface BreakRecallProps {
  /** A break is on and the card would be visible; each switch to true starts a fresh break. */
  active: boolean;
  /** The usual companion, shown outside a break and once the person rests, finishes, or has nothing due. */
  rest: React.ReactNode;
}

/**
 * Offers a few due concept cards beside the timer during a Pomodoro break. Always rendered, so
 * the companion keeps its place in the tree (and its quote timer) across break transitions.
 */
export const BreakRecall: React.FC<BreakRecallProps> = ({ active, rest }) => {
  const enabled = useSettingsStore(
    (state) => state.settings.conceptCardsEnabled && state.settings.conceptBreakRecall
  );
  const activeRecall = useSettingsStore((state) => state.settings.conceptActiveRecall);

  const cards = useConceptCardsStore((state) => state.cards);
  const initialize = useConceptCardsStore((state) => state.initialize);
  const reviewCard = useConceptCardsStore((state) => state.reviewCard);
  const toggleFavorite = useConceptCardsStore((state) => state.toggleFavorite);

  const [handledIds, setHandledIds] = useState<string[]>([]);
  const [rested, setRested] = useState(false);
  const [grading, setGrading] = useState(false);
  const [position, setPosition] = useState(0);
  const [wasActive, setWasActive] = useState(active);

  if (active !== wasActive) {
    setWasActive(active);
    if (active) {
      setHandledIds([]);
      setRested(false);
      setPosition(0);
    }
  }

  useEffect(() => {
    if (enabled && active) {
      initialize();
    }
  }, [enabled, active, initialize]);

  const deck = useMemo(() => {
    const due = getDueConceptCards(cards, new Date()).filter(
      (card) => !handledIds.includes(card.id)
    );
    return due.slice(0, CONCEPT_BREAK_RECALL_MAX - handledIds.length);
  }, [cards, handledIds]);

  // No isLoading gate: each break reloads a deck that is usually already here, and gating
  // on it would flash the quote. A first load with no cards yet has an empty deck anyway.
  if (!active || !enabled || rested || deck.length === 0) {
    return <>{rest}</>;
  }

  const current = deck[position % deck.length];
  const total = handledIds.length + deck.length;

  const moveBy = (delta: number) => {
    setPosition((p) => (((p + delta) % deck.length) + deck.length) % deck.length);
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
    setHandledIds((ids) => [...ids, current.id]);
    setPosition(0);
  };

  return (
    <div className="flex w-full flex-col items-center gap-density-md">
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
        queueLabel={`Break recall ${handledIds.length + 1} of ${total}`}
        onSkipToQuote={() => setRested(true)}
      />
      <button
        type="button"
        onClick={() => setRested(true)}
        className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-variant hover:text-primary"
      >
        Just rest
      </button>
    </div>
  );
};
