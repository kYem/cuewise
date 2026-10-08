import {
  type ConceptCadence,
  type ConceptCard,
  type ConceptFraming,
  type ConceptGrade,
  getDueConceptCards,
} from '@cuewise/shared';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useShortcutAction } from '../shortcuts/ShortcutProvider';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { isShortcutKeyEvent } from '../utils/keyboard-shortcut';
import { ConceptCardDisplay } from './ConceptCardDisplay';

// "1 in N tabs" period per ambient cadence; 'every'/'off' are handled before this
// lookup, so adding a cadence forces an explicit period here (compile error otherwise).
const CADENCE_PERIOD: Record<'third' | 'ten', number> = { third: 3, ten: 10 };

export interface SurfacingDecision {
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

/**
 * The due card this tab shows and its browse position. When surfacing is on the
 * user browses the whole due pile; when off, only cards added during the tab
 * (ids not in the decision) surface — so a concept you just added appears even
 * if the cadence gate kept this tab on quotes. `current` is undefined to fall
 * back to quotes; `index` is a free-running counter wrapped into the deck.
 */
/** What this tab may browse: the whole due pile, or only cards added since its decision. */
export function surfacedDeck(
  due: ConceptCard[],
  decision: SurfacingDecision | null
): ConceptCard[] {
  if (decision === null) {
    return [];
  }
  return decision.show ? due : due.filter((card) => !decision.knownIds.includes(card.id));
}

export function selectSurfacedCard(
  due: ConceptCard[],
  decision: SurfacingDecision | null,
  index: number,
  // The card already on screen. Any realm may change the deck mid-read, and picking by position
  // alone would hand the reader a different card when the length shifts under them.
  anchorId?: string | null
): { current: ConceptCard | undefined; position: number } {
  const deck = surfacedDeck(due, decision);
  if (deck.length === 0) {
    return { current: undefined, position: 0 };
  }
  const anchored = anchorId === undefined || anchorId === null ? -1 : indexOfCard(deck, anchorId);
  const position = anchored >= 0 ? anchored : ((index % deck.length) + deck.length) % deck.length;
  return { current: deck[position], position };
}

function indexOfCard(deck: ConceptCard[], id: string): number {
  return deck.findIndex((card) => card.id === id);
}

// Explicit per-tab choice that outranks the cadence decision. 'quotes' also
// suppresses cards added during the tab, which decision.show alone does not.
type SlotOverride = 'auto' | 'quotes' | 'concepts';

interface ConceptRotationProps {
  /** Rendered when no concept surfaces this tab (the normal quote rotation). */
  fallback: React.ReactNode;
  /** Opens the add-concept modal from the card's "Add concept" affordance. */
  onAdd?: () => void;
  /** Same signal QuoteDisplay sends: restarts the host's auto-rotation clock. */
  onManualRefresh?: () => void;
}

/**
 * Blends due concept cards into the quote slot. Decides once per tab (in an
 * effect, so render stays pure) whether to surface concepts: ambient framing
 * yields back to quotes after one card, while queue framing clears the due pile
 * front-to-back. A graded card leaves the deck for the rest of the tab (so a
 * lapsing "Again" card never loops back immediately); the toolbar's prev/next
 * browse what remains.
 */
export const ConceptRotation: React.FC<ConceptRotationProps> = ({
  fallback,
  onAdd,
  onManualRefresh,
}) => {
  const enabled = useSettingsStore((state) => state.settings.conceptCardsEnabled);
  const cadence = useSettingsStore((state) => state.settings.conceptCadence);
  const framing = useSettingsStore((state) => state.settings.conceptFraming);
  const activeRecall = useSettingsStore((state) => state.settings.conceptActiveRecall);

  const cards = useConceptCardsStore((state) => state.cards);
  const isLoading = useConceptCardsStore((state) => state.isLoading);
  const reviewCard = useConceptCardsStore((state) => state.reviewCard);
  const toggleFavorite = useConceptCardsStore((state) => state.toggleFavorite);

  const [handledIds, setHandledIds] = useState<string[]>([]);
  const [decision, setDecision] = useState<SurfacingDecision | null>(null);
  const [grading, setGrading] = useState(false);
  // Browse position for the toolbar's prev/next within the surfaced deck.
  const [index, setIndex] = useState(0);
  // The card on screen, so a deck change from another realm cannot move the reader off it.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotOverride>('auto');

  // NewTabPage loads the deck: it is the only host, and it reads the cards itself whether or not
  // this renders. Initializing here too cost every new tab a second read and reconcile.

  // Re-evaluate the once-per-tab decision (and clear the session deck) when the
  // surfacing settings change, so the queue counter and total stay in sync.
  useEffect(() => {
    setDecision(null);
    setHandledIds([]);
    setIndex(0);
    setAnchorId(null);
    setSlot('auto');
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

  const effectiveDecision: SurfacingDecision | null =
    slot === 'concepts' ? { show: true, knownIds: decision?.knownIds ?? [] } : decision;
  const deck = useMemo(() => surfacedDeck(due, effectiveDecision), [due, effectiveDecision]);
  const { current, position } = selectSurfacedCard(due, effectiveDecision, index, anchorId);
  const surfaced = slot === 'quotes' ? undefined : current;

  // Pin whatever surfaced, and re-pin once the anchored card leaves the deck — graded here,
  // graded on another device, or no longer due.
  useEffect(() => {
    if (current === undefined) {
      return;
    }
    if (anchorId === null || !deck.some((card) => card.id === anchorId)) {
      setAnchorId(current.id);
    }
  }, [current, anchorId, deck]);

  useEffect(() => {
    if (!enabled || isLoading || due.length === 0) {
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'c' || !isShortcutKeyEvent(e)) {
        return;
      }
      e.preventDefault();
      setSlot(surfaced ? 'quotes' : 'concepts');
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [enabled, isLoading, due.length, surfaced]);

  const yieldToQuotes = () => {
    setDecision((prev) => (prev ? { ...prev, show: false } : prev));
    setSlot('auto');
  };

  // A fresh quote, and onManualRefresh for the reason QuoteDisplay's space path needs it:
  // without it the rotation timer keeps its phase and overwrites the quote just asked for.
  const skipToQuote = () => {
    // setSlot('quotes'), not just yieldToQuotes: a card added during this tab is not in
    // knownIds and keeps surfacing, which would leave space looking dead. `c` brings it back.
    yieldToQuotes();
    setSlot('quotes');
    useQuoteStore.getState().refreshQuote({ userInitiated: true });
    onManualRefresh?.();
  };

  const conceptWaiting = enabled && !isLoading && due.length > 0 && !surfaced;
  useShortcutAction('concept.show', conceptWaiting ? () => setSlot('concepts') : null);
  // While a card holds the slot QuoteDisplay is unmounted, so its New quote comes from here.
  useShortcutAction('quote.next', surfaced ? skipToQuote : null);

  if (!surfaced) {
    return <>{fallback}</>;
  }

  // Browsing moves the anchor: it is the one thing that should change the card on screen.
  const moveBy = (delta: number) => {
    if (deck.length === 0) {
      return;
    }
    const next = (((position + delta) % deck.length) + deck.length) % deck.length;
    setIndex(next);
    setAnchorId(deck[next].id);
  };

  const goNext = () => moveBy(1);
  const goPrev = () => moveBy(-1);

  const handleGrade = async (grade: ConceptGrade) => {
    if (grading) {
      return; // ignore rapid double-grades while the first review persists
    }
    setGrading(true);
    // Only retire the card from the deck once the review actually persisted.
    const ok = await reviewCard(surfaced.id, grade);
    setGrading(false);
    if (!ok) {
      return;
    }
    setHandledIds((ids) => [...ids, surfaced.id]);
    // Ambient: one moment of recall, then back to the calm quote rotation.
    if (framing === 'ambient') {
      yieldToQuotes();
    }
  };

  // Queue framing always sets decision.show, so browseDeck === due and `position`
  // indexes into `due` — the label's denominator matches the card on screen.
  const queueLabel = framing === 'queue' ? `Card ${position + 1} of ${due.length}` : undefined;

  return (
    <ConceptCardDisplay
      key={surfaced.id}
      card={surfaced}
      activeRecall={activeRecall}
      onGrade={handleGrade}
      onPrev={goPrev}
      onNext={goNext}
      isFavorite={surfaced.isFavorite ?? false}
      onToggleFavorite={() => toggleFavorite(surfaced.id)}
      dueCount={due.length}
      onAdd={onAdd}
      queueLabel={queueLabel}
      onSkipToQuote={skipToQuote}
    />
  );
};
