import {
  type ConceptCadence,
  type ConceptFraming,
  type ConceptGrade,
  getDueConceptCards,
} from '@cuewise/shared';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { useSettingsStore } from '../stores/settings-store';
import { ConceptCardDisplay } from './ConceptCardDisplay';

// "1 in N tabs" period per ambient cadence; 'every'/'off' are handled before this
// lookup, so adding a cadence forces an explicit period here (compile error otherwise).
const CADENCE_PERIOD: Record<'third' | 'ten', number> = { third: 3, ten: 10 };

interface SurfacingDecision {
  show: boolean;
  // Card ids in the deck when this tab's surfacing was decided. A due card whose
  // id isn't here was added during the tab and surfaces without a refresh.
  knownIds: string[];
}

// Whether this tab opens with a concept at all. 'queue' always surfaces the due
// pile; 'ambient' draws per cadence so a card lands roughly "1 in N tabs".
function cadenceAllows(framing: ConceptFraming, cadence: ConceptCadence): boolean {
  if (framing === 'queue') {
    return true;
  }
  if (cadence === 'off') {
    return false;
  }
  if (cadence === 'every') {
    return true;
  }
  return Math.random() < 1 / CADENCE_PERIOD[cadence];
}

interface ConceptRotationProps {
  /** Rendered when no concept surfaces this tab (the normal quote rotation). */
  fallback: React.ReactNode;
  /** Opens the add-concept modal from the card's "Add concept" affordance. */
  onAdd?: () => void;
}

/**
 * Blends due concept cards into the quote slot. Decides once per tab (in an
 * effect, so render stays pure) whether to surface concepts: ambient framing
 * yields back to quotes after one card, while queue framing clears the due pile
 * front-to-back. A graded card leaves the deck for the rest of the tab (so a
 * lapsing "Again" card never loops back immediately); the toolbar's prev/next
 * browse what remains.
 */
export const ConceptRotation: React.FC<ConceptRotationProps> = ({ fallback, onAdd }) => {
  const enabled = useSettingsStore((state) => state.settings.conceptCardsEnabled);
  const cadence = useSettingsStore((state) => state.settings.conceptCadence);
  const framing = useSettingsStore((state) => state.settings.conceptFraming);
  const activeRecall = useSettingsStore((state) => state.settings.conceptActiveRecall);

  const cards = useConceptCardsStore((state) => state.cards);
  const isLoading = useConceptCardsStore((state) => state.isLoading);
  const initialize = useConceptCardsStore((state) => state.initialize);
  const reviewCard = useConceptCardsStore((state) => state.reviewCard);
  const toggleFavorite = useConceptCardsStore((state) => state.toggleFavorite);

  const [handledIds, setHandledIds] = useState<string[]>([]);
  const [decision, setDecision] = useState<SurfacingDecision | null>(null);
  const [grading, setGrading] = useState(false);
  // Browse position for the toolbar's prev/next within the surfaced deck.
  const [index, setIndex] = useState(0);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Re-evaluate the once-per-tab decision (and clear the session deck) when the
  // surfacing settings change, so the queue counter and total stay in sync.
  useEffect(() => {
    setDecision(null);
    setHandledIds([]);
    setIndex(0);
  }, [framing, cadence, enabled]);

  const due = useMemo(() => {
    if (!enabled || isLoading) {
      return [];
    }
    return getDueConceptCards(cards, new Date()).filter((card) => !handledIds.includes(card.id));
  }, [enabled, isLoading, cards, handledIds]);

  // The cadence coin-flip lives here (not in render) to keep the render pure.
  useEffect(() => {
    if (!enabled || isLoading || decision !== null || due.length === 0) {
      return;
    }
    setDecision({ show: cadenceAllows(framing, cadence), knownIds: due.map((card) => card.id) });
  }, [enabled, isLoading, decision, due.length, framing, cadence]);

  if (!enabled || isLoading) {
    return <>{fallback}</>;
  }

  // A due card whose id wasn't in the deck at decision time was added during this
  // tab — surface it right away (no refresh), even if the cadence gate kept this
  // tab on quotes. Show that new card rather than a pre-existing one it suppressed.
  const newCards =
    decision !== null ? due.filter((card) => !decision.knownIds.includes(card.id)) : [];
  // The deck the toolbar's prev/next browse: the full due pile when surfacing is
  // on, otherwise just the freshly-added card(s).
  const browseDeck = decision?.show ? due : newCards;
  const position =
    browseDeck.length > 0
      ? ((index % browseDeck.length) + browseDeck.length) % browseDeck.length
      : 0;
  const current = browseDeck.length > 0 ? browseDeck[position] : undefined;
  if (!current) {
    return <>{fallback}</>;
  }

  const yieldToQuotes = () => {
    setDecision((prev) => (prev ? { ...prev, show: false } : prev));
  };

  const goNext = () => setIndex((i) => i + 1);
  const goPrev = () => setIndex((i) => i - 1);

  const handleGrade = async (grade: ConceptGrade) => {
    if (grading) {
      return; // ignore rapid double-grades while the first review persists
    }
    setGrading(true);
    // Only retire the card from the deck once the review actually persisted.
    const ok = await reviewCard(current.id, grade);
    setGrading(false);
    if (!ok) {
      return;
    }
    setHandledIds((ids) => [...ids, current.id]);
    // Ambient: one moment of recall, then back to the calm quote rotation.
    if (framing === 'ambient') {
      yieldToQuotes();
    }
  };

  const queueLabel = framing === 'queue' ? `Card ${position + 1} of ${due.length}` : undefined;

  return (
    <ConceptCardDisplay
      key={current.id}
      card={current}
      activeRecall={activeRecall}
      onGrade={handleGrade}
      onPrev={goPrev}
      onNext={goNext}
      isFavorite={current.isFavorite ?? false}
      onToggleFavorite={() => toggleFavorite(current.id)}
      dueCount={due.length}
      onAdd={onAdd}
      queueLabel={queueLabel}
    />
  );
};
