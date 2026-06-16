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
  const period = cadence === 'third' ? 3 : 10;
  return Math.random() < 1 / period;
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
 * front-to-back. A handled (graded or skipped) card leaves the deck for the
 * rest of the tab, so a lapsing "Again" card never loops back immediately.
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

  const [handledIds, setHandledIds] = useState<string[]>([]);
  const [decision, setDecision] = useState<{ show: boolean; total: number } | null>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Re-evaluate the once-per-tab decision when the surfacing settings change.
  useEffect(() => {
    setDecision(null);
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
    setDecision({ show: cadenceAllows(framing, cadence), total: due.length });
  }, [enabled, isLoading, decision, due.length, framing, cadence]);

  if (!enabled || isLoading) {
    return <>{fallback}</>;
  }

  const current = decision?.show ? due[0] : undefined;
  if (!current) {
    return <>{fallback}</>;
  }

  const yieldToQuotes = () => {
    setDecision((prev) => (prev ? { ...prev, show: false } : prev));
  };

  const handleGrade = (grade: ConceptGrade) => {
    reviewCard(current.id, grade);
    setHandledIds((ids) => [...ids, current.id]);
    // Ambient: one moment of recall, then back to the calm quote rotation.
    if (framing === 'ambient') {
      yieldToQuotes();
    }
  };

  const handleSkip = () => {
    setHandledIds((ids) => [...ids, current.id]);
    if (framing === 'ambient') {
      yieldToQuotes();
    }
  };

  const total = decision?.total ?? due.length;
  const queueLabel =
    framing === 'queue' ? `Card ${Math.min(handledIds.length + 1, total)} of ${total}` : undefined;

  return (
    <ConceptCardDisplay
      key={current.id}
      card={current}
      activeRecall={activeRecall}
      onGrade={handleGrade}
      onSkip={handleSkip}
      onAdd={onAdd}
      queueLabel={queueLabel}
    />
  );
};
