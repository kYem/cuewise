import {
  type ConceptCard,
  type ConceptGrade,
  generateId,
  getDueConceptCards,
  logger,
  newConceptSchedule,
  reviewConceptCard,
  STORAGE_KEYS,
} from '@cuewise/shared';
import { getConceptCards as loadConceptCards, updateConceptCards } from '@cuewise/storage';
import { create } from 'zustand';
import { createStaleLatch, createStorageObserver, sameEntities } from './storage-changes';
import { useToastStore } from './toast-store';

const SAVE_ERROR_MESSAGE = 'Failed to save concept. Please try again.';
const DELETE_ERROR_MESSAGE = 'Failed to delete concept. Please try again.';
const REVIEW_ERROR_MESSAGE = 'Failed to save review. Please try again.';

// Optional content fields, derived from ConceptCard so the two stay in lockstep.
type ConceptCardExtras = Pick<ConceptCard, 'details' | 'tags' | 'source'>;

// One card for the bulk-add path (term + definition, plus the optional extras).
interface ConceptCardInput {
  term: string;
  definition: string;
  extras?: ConceptCardExtras;
}

type ConceptCardUpdates = Partial<
  Pick<ConceptCard, 'term' | 'definition' | 'isFavorite'> & ConceptCardExtras
>;

interface ConceptCardsStore {
  cards: ConceptCard[];
  isLoading: boolean;
  error: string | null;

  // Actions - return false on error, true on success
  initialize: () => Promise<void>;
  addCard: (term: string, definition: string, extras?: ConceptCardExtras) => Promise<boolean>;
  // Bulk-add (e.g. a starter template pack). Skips blanks and terms already in
  // the deck (case-insensitive), persists once, and resolves to the count added
  // — 0 means nothing new; null means the save failed (already reported here).
  addCards: (inputs: ConceptCardInput[]) => Promise<number | null>;
  updateCard: (id: string, updates: ConceptCardUpdates) => Promise<boolean>;
  deleteCard: (id: string) => Promise<boolean>;
  reviewCard: (id: string, grade: ConceptGrade) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<boolean>;

  // Selectors
  getDueCards: () => ConceptCard[];
}

function reportError(set: (partial: Partial<ConceptCardsStore>) => void, message: string): false {
  set({ error: message });
  useToastStore.getState().error(message);
  return false;
}

// Apply edits with trimmed text; empty optional fields collapse to undefined.
function applyCardUpdates(card: ConceptCard, updates: ConceptCardUpdates): ConceptCard {
  const next = { ...card };
  if (updates.term !== undefined) {
    next.term = updates.term.trim();
  }
  if (updates.definition !== undefined) {
    next.definition = updates.definition.trim();
  }
  if (updates.details !== undefined) {
    next.details = updates.details.trim() || undefined;
  }
  if (updates.tags !== undefined) {
    // Match the add path: an empty tag list collapses to undefined, not [].
    next.tags = updates.tags.length > 0 ? updates.tags : undefined;
  }
  if (updates.source !== undefined) {
    next.source = updates.source.trim() || undefined;
  }
  if (updates.isFavorite !== undefined) {
    next.isFavorite = updates.isFavorite;
  }
  return next;
}

const STALE_CONCEPTS_MESSAGE =
  "Cuewise couldn't re-read your concepts just now, so what you see may be out of date.";

const conceptCardsObserver = createStorageObserver(
  'concept cards',
  [STORAGE_KEYS.CONCEPT_CARDS],
  async () => {
    const cards = await loadConceptCards();
    if (sameEntities(useConceptCardsStore.getState().cards, cards)) {
      return;
    }
    useConceptCardsStore.setState({ cards });
  },
  createStaleLatch((message) => useToastStore.getState().warning(message), STALE_CONCEPTS_MESSAGE)
);

export const useConceptCardsStore = create<ConceptCardsStore>((set, get) => ({
  cards: [],
  isLoading: true,
  error: null,

  initialize: async () => {
    // Before the read: a write landing during it is otherwise announced to nobody.
    conceptCardsObserver.subscribe();
    try {
      set({ isLoading: true, error: null });
      const cards = await loadConceptCards();
      set({ cards, isLoading: false });
    } catch (error) {
      logger.error('Error initializing concept cards store', error);
      set({ isLoading: false });
      reportError(set, 'Failed to load concepts. Please refresh the page.');
    }
    // Awaited, last, and outside the try so a failed load still reconciles.
    await conceptCardsObserver.reconcile();
  },

  addCard: async (term: string, definition: string, extras: ConceptCardExtras = {}) => {
    const trimmedTerm = term.trim();
    const trimmedDefinition = definition.trim();
    if (!trimmedTerm || !trimmedDefinition) {
      return false;
    }

    try {
      const now = new Date();
      const newCard: ConceptCard = {
        id: generateId(),
        term: trimmedTerm,
        definition: trimmedDefinition,
        details: extras.details?.trim() || undefined,
        tags: extras.tags,
        source: extras.source?.trim() || undefined,
        createdAt: now.toISOString(),
        schedule: newConceptSchedule(now),
      };

      const { result, cards } = await updateConceptCards((current) => [...current, newCard]);
      if (result.success === false) {
        return reportError(set, SAVE_ERROR_MESSAGE);
      }

      set({ cards, error: null });
      return true;
    } catch (error) {
      logger.error('Error adding concept card', error);
      return reportError(set, SAVE_ERROR_MESSAGE);
    }
  },

  addCards: async (inputs: ConceptCardInput[]) => {
    const now = new Date();
    const createdAt = now.toISOString();
    const seenInBatch = new Set<string>();
    const batch: ConceptCard[] = [];
    for (const input of inputs) {
      const term = input.term.trim();
      const definition = input.definition.trim();
      if (!term || !definition) {
        continue;
      }
      const key = term.toLowerCase();
      if (seenInBatch.has(key)) {
        continue;
      }
      seenInBatch.add(key);
      batch.push({
        id: generateId(),
        term,
        definition,
        details: input.extras?.details?.trim() || undefined,
        tags: input.extras?.tags,
        source: input.extras?.source?.trim() || undefined,
        createdAt,
        // Fresh per card (like addCard) — a shared reference would advance every
        // sibling's review schedule at once if anything ever mutated in place.
        schedule: newConceptSchedule(now),
      });
    }

    if (batch.length === 0) {
      return 0;
    }

    try {
      let added: ConceptCard[] = [];
      const { result, cards } = await updateConceptCards((current) => {
        const inDeck = new Set(current.map((card) => card.term.trim().toLowerCase()));
        added = batch.filter((card) => !inDeck.has(card.term.toLowerCase()));
        return [...current, ...added];
      });
      if (result.success === false) {
        reportError(set, SAVE_ERROR_MESSAGE);
        return null;
      }

      set({ cards, error: null });
      return added.length;
    } catch (error) {
      logger.error('Error adding concept cards', error);
      reportError(set, SAVE_ERROR_MESSAGE);
      return null;
    }
  },

  updateCard: async (id: string, updates: ConceptCardUpdates) => {
    if (!get().cards.some((card) => card.id === id)) {
      return false;
    }
    if (updates.term !== undefined && !updates.term.trim()) {
      return false;
    }
    if (updates.definition !== undefined && !updates.definition.trim()) {
      return false;
    }

    try {
      const { result, cards } = await updateConceptCards((current) =>
        current.map((card) => (card.id === id ? applyCardUpdates(card, updates) : card))
      );
      if (result.success === false) {
        return reportError(set, SAVE_ERROR_MESSAGE);
      }

      set({ cards, error: null });
      return true;
    } catch (error) {
      logger.error('Error updating concept card', error);
      return reportError(set, SAVE_ERROR_MESSAGE);
    }
  },

  deleteCard: async (id: string) => {
    try {
      const { result, cards } = await updateConceptCards((current) =>
        current.filter((card) => card.id !== id)
      );
      if (result.success === false) {
        return reportError(set, DELETE_ERROR_MESSAGE);
      }

      set({ cards, error: null });
      return true;
    } catch (error) {
      logger.error('Error deleting concept card', error);
      return reportError(set, DELETE_ERROR_MESSAGE);
    }
  },

  reviewCard: async (id: string, grade: ConceptGrade) => {
    if (!get().cards.some((card) => card.id === id)) {
      return false;
    }

    try {
      const now = new Date();
      const { result, cards } = await updateConceptCards((current) =>
        current.map((card) => (card.id === id ? reviewConceptCard(card, grade, now) : card))
      );
      if (result.success === false) {
        return reportError(set, REVIEW_ERROR_MESSAGE);
      }

      set({ cards, error: null });
      return true;
    } catch (error) {
      logger.error('Error reviewing concept card', error);
      return reportError(set, REVIEW_ERROR_MESSAGE);
    }
  },

  // A favorite toggle is just an update of the isFavorite field — route through
  // updateCard so the persist-or-rollback path lives in one place.
  toggleFavorite: async (id: string) => {
    const existing = get().cards.find((card) => card.id === id);
    if (!existing) {
      return false;
    }
    return get().updateCard(id, { isFavorite: !existing.isFavorite });
  },

  getDueCards: () => getDueConceptCards(get().cards, new Date()),
}));
