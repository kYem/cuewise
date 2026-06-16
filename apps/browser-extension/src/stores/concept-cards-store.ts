import {
  type ConceptCard,
  type ConceptGrade,
  generateId,
  getDueConceptCards,
  logger,
  newConceptSchedule,
  reviewConceptCard,
} from '@cuewise/shared';
import {
  getConceptCards as loadConceptCards,
  setConceptCards as saveConceptCards,
} from '@cuewise/storage';
import { create } from 'zustand';
import { useToastStore } from './toast-store';

const SAVE_ERROR_MESSAGE = 'Failed to save concept. Please try again.';
const DELETE_ERROR_MESSAGE = 'Failed to delete concept. Please try again.';
const REVIEW_ERROR_MESSAGE = 'Failed to save review. Please try again.';

interface ConceptCardExtras {
  details?: string;
  tags?: string[];
  source?: string;
}

type ConceptCardUpdates = Partial<
  Pick<ConceptCard, 'term' | 'definition' | 'details' | 'tags' | 'source'>
>;

interface ConceptCardsStore {
  cards: ConceptCard[];
  isLoading: boolean;
  error: string | null;

  // Actions - return false on error, true on success
  initialize: () => Promise<void>;
  addCard: (term: string, definition: string, extras?: ConceptCardExtras) => Promise<boolean>;
  updateCard: (id: string, updates: ConceptCardUpdates) => Promise<boolean>;
  deleteCard: (id: string) => Promise<boolean>;
  reviewCard: (id: string, grade: ConceptGrade) => Promise<boolean>;

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
  return next;
}

export const useConceptCardsStore = create<ConceptCardsStore>((set, get) => ({
  cards: [],
  isLoading: true,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });
      const cards = await loadConceptCards();
      set({ cards, isLoading: false });
    } catch (error) {
      logger.error('Error initializing concept cards store', error);
      set({ isLoading: false });
      reportError(set, 'Failed to load concepts. Please refresh the page.');
    }
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

      const updatedCards = [...get().cards, newCard];
      const result = await saveConceptCards(updatedCards);
      if (result?.success === false) {
        return reportError(set, SAVE_ERROR_MESSAGE);
      }

      set({ cards: updatedCards, error: null });
      return true;
    } catch (error) {
      logger.error('Error adding concept card', error);
      return reportError(set, SAVE_ERROR_MESSAGE);
    }
  },

  updateCard: async (id: string, updates: ConceptCardUpdates) => {
    const { cards } = get();
    const existing = cards.find((card) => card.id === id);
    if (!existing) {
      return false;
    }
    if (updates.term !== undefined && !updates.term.trim()) {
      return false;
    }
    if (updates.definition !== undefined && !updates.definition.trim()) {
      return false;
    }

    try {
      const updatedCards = cards.map((card) =>
        card.id === id ? applyCardUpdates(card, updates) : card
      );
      const result = await saveConceptCards(updatedCards);
      if (result?.success === false) {
        return reportError(set, SAVE_ERROR_MESSAGE);
      }

      set({ cards: updatedCards, error: null });
      return true;
    } catch (error) {
      logger.error('Error updating concept card', error);
      return reportError(set, SAVE_ERROR_MESSAGE);
    }
  },

  deleteCard: async (id: string) => {
    try {
      const updatedCards = get().cards.filter((card) => card.id !== id);
      const result = await saveConceptCards(updatedCards);
      if (result?.success === false) {
        return reportError(set, DELETE_ERROR_MESSAGE);
      }

      set({ cards: updatedCards, error: null });
      return true;
    } catch (error) {
      logger.error('Error deleting concept card', error);
      return reportError(set, DELETE_ERROR_MESSAGE);
    }
  },

  reviewCard: async (id: string, grade: ConceptGrade) => {
    const { cards } = get();
    const existing = cards.find((card) => card.id === id);
    if (!existing) {
      return false;
    }

    try {
      const reviewed = reviewConceptCard(existing, grade, new Date());
      const updatedCards = cards.map((card) => (card.id === id ? reviewed : card));
      const result = await saveConceptCards(updatedCards);
      if (result?.success === false) {
        return reportError(set, REVIEW_ERROR_MESSAGE);
      }

      set({ cards: updatedCards, error: null });
      return true;
    } catch (error) {
      logger.error('Error reviewing concept card', error);
      return reportError(set, REVIEW_ERROR_MESSAGE);
    }
  },

  getDueCards: () => getDueConceptCards(get().cards, new Date()),
}));
