import {
  type ConceptCadence,
  type ConceptFraming,
  type ConceptGrade,
  getDueConceptCards,
} from '@cuewise/shared';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
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
 * Blends due concept cards into the quote slot. On mount it decides — once —
 * whether this tab surfaces concepts; in ambient framing one graded card then
 * yields back to quotes, while queue framing clears the due pile front-to-back.
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

  const decisionRef = useRef<{ show: boolean; total: number } | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [skippedIds, setSkippedIds] = useState<string[]>([]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Reads `cards` directly so a review/skip re-renders the slot.
  const due =
    enabled && !isLoading
      ? getDueConceptCards(cards, new Date()).filter((c) => !skippedIds.includes(c.id))
      : [];

  if (!enabled || isLoading) {
    return <>{fallback}</>;
  }

  if (decisionRef.current === null && due.length > 0) {
    decisionRef.current = { show: cadenceAllows(framing, cadence), total: due.length };
  }
  const current = decisionRef.current?.show ? due[0] : undefined;

  if (!current) {
    return <>{fallback}</>;
  }

  const handleGrade = (grade: ConceptGrade) => {
    reviewCard(current.id, grade);
    setReviewedCount((count) => count + 1);
    // Ambient: one moment of recall, then back to the calm quote rotation.
    if (framing === 'ambient') {
      decisionRef.current = { show: false, total: decisionRef.current?.total ?? 0 };
    }
  };

  const handleSkip = () => {
    setSkippedIds((ids) => [...ids, current.id]);
  };

  const queueLabel =
    framing === 'queue'
      ? `Card ${reviewedCount + 1} of ${decisionRef.current?.total ?? due.length}`
      : undefined;

  return (
    <ConceptCardDisplay
      card={current}
      activeRecall={activeRecall}
      onGrade={handleGrade}
      onSkip={handleSkip}
      onAdd={onAdd}
      queueLabel={queueLabel}
    />
  );
};
