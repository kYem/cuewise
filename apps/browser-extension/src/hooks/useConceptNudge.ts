import { getTodayDateString, type Settings, shouldShowConceptNudge } from '@cuewise/shared';
import { useEffect, useState } from 'react';

type ConceptNudgePatch = Partial<
  Pick<Settings, 'conceptNudgeCount' | 'conceptNudgeLastShownAt' | 'conceptNudgeDismissed'>
>;

interface UseConceptNudgeParams {
  ready: boolean; // settings have loaded
  enabled: boolean;
  conceptCount: number;
  totalQuoteViews: number;
  // Flattened nudge settings so the effect deps stay referentially stable.
  dismissed: boolean;
  count: number;
  lastShownAt: string | null;
  updateSettings: (patch: ConceptNudgePatch) => void;
}

export interface UseConceptNudgeResult {
  isVisible: boolean;
  onDismiss: () => void;
}

/**
 * Drives the concept-cards discovery nudge: evaluates eligibility at tab open
 * and records the show (which caps it to a couple of appearances). Mirrors
 * useReviewPrompt.
 */
export function useConceptNudge({
  ready,
  enabled,
  conceptCount,
  totalQuoteViews,
  dismissed,
  count,
  lastShownAt,
  updateSettings,
}: UseConceptNudgeParams): UseConceptNudgeResult {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }
    // Retract once the user is no longer a candidate (added a card, disabled, dismissed).
    if (isVisible) {
      if (conceptCount > 0 || !enabled || dismissed) {
        setIsVisible(false);
      }
      return;
    }
    if (dismissed) {
      return;
    }
    const today = getTodayDateString();
    const eligible = shouldShowConceptNudge({
      enabled,
      conceptCount,
      totalQuoteViews,
      state: { dismissed, count, lastShownAt },
      today,
    });
    if (eligible) {
      setIsVisible(true);
      updateSettings({ conceptNudgeCount: count + 1, conceptNudgeLastShownAt: today });
    }
  }, [
    ready,
    isVisible,
    enabled,
    conceptCount,
    totalQuoteViews,
    dismissed,
    count,
    lastShownAt,
    updateSettings,
  ]);

  const onDismiss = () => {
    updateSettings({ conceptNudgeDismissed: true });
    setIsVisible(false);
  };

  return { isVisible, onDismiss };
}
