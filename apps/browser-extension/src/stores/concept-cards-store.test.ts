import * as storage from '@cuewise/storage';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConceptCardsStore } from './concept-cards-store';

vi.mock('@cuewise/storage', () => ({
  getConceptCards: vi.fn(),
  setConceptCards: vi.fn(),
}));

const toastError = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({
      error: toastError,
      warning: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

describe('Concept Cards Store', () => {
  beforeEach(() => {
    useConceptCardsStore.setState({ cards: [], isLoading: true, error: null });
    vi.clearAllMocks();
    vi.mocked(storage.setConceptCards).mockResolvedValue({ success: true });
  });

  describe('initialize', () => {
    it('loads cards from storage', async () => {
      const cards = conceptCardFactory.buildList(2);
      vi.mocked(storage.getConceptCards).mockResolvedValue(cards);

      await useConceptCardsStore.getState().initialize();

      const state = useConceptCardsStore.getState();
      expect(state.cards).toEqual(cards);
      expect(state.isLoading).toBe(false);
    });

    it('sets an error when loading fails', async () => {
      vi.mocked(storage.getConceptCards).mockRejectedValue(new Error('boom'));

      await useConceptCardsStore.getState().initialize();

      expect(useConceptCardsStore.getState().error).toBeTruthy();
      expect(useConceptCardsStore.getState().isLoading).toBe(false);
    });
  });

  describe('addCard', () => {
    it('adds a new card due today', async () => {
      const ok = await useConceptCardsStore.getState().addCard('Saga pattern', 'A definition.', {
        tags: ['microservices'],
      });

      expect(ok).toBe(true);
      const [card] = useConceptCardsStore.getState().cards;
      expect(card.term).toBe('Saga pattern');
      expect(card.tags).toEqual(['microservices']);
      expect(card.schedule.repetitions).toBe(0);
      expect(storage.setConceptCards).toHaveBeenCalledOnce();
    });

    it('rejects a blank term or definition without persisting', async () => {
      expect(await useConceptCardsStore.getState().addCard('', 'def')).toBe(false);
      expect(await useConceptCardsStore.getState().addCard('term', '   ')).toBe(false);
      expect(storage.setConceptCards).not.toHaveBeenCalled();
    });

    it('honors a failed persist result', async () => {
      vi.mocked(storage.setConceptCards).mockResolvedValue({ success: false });

      const ok = await useConceptCardsStore.getState().addCard('Term', 'Definition');

      expect(ok).toBe(false);
      expect(useConceptCardsStore.getState().cards).toHaveLength(0);
      expect(toastError).toHaveBeenCalled();
    });
  });

  describe('updateCard', () => {
    it('updates term and trims it', async () => {
      const card = conceptCardFactory.build({ id: '1' });
      useConceptCardsStore.setState({ cards: [card] });

      const ok = await useConceptCardsStore.getState().updateCard('1', { term: '  Renamed  ' });

      expect(ok).toBe(true);
      expect(useConceptCardsStore.getState().cards[0].term).toBe('Renamed');
    });

    it('returns false for an unknown id or a blank required field', async () => {
      const card = conceptCardFactory.build({ id: '1' });
      useConceptCardsStore.setState({ cards: [card] });

      expect(await useConceptCardsStore.getState().updateCard('missing', { term: 'x' })).toBe(
        false
      );
      expect(await useConceptCardsStore.getState().updateCard('1', { definition: '' })).toBe(false);
    });

    it('clears the source when emptied', async () => {
      const card = conceptCardFactory.build({ id: '1', source: 'Old book' });
      useConceptCardsStore.setState({ cards: [card] });

      await useConceptCardsStore.getState().updateCard('1', { source: '' });

      expect(useConceptCardsStore.getState().cards[0].source).toBeUndefined();
    });
  });

  describe('deleteCard', () => {
    it('removes the matching card', async () => {
      useConceptCardsStore.setState({
        cards: [conceptCardFactory.build({ id: '1' }), conceptCardFactory.build({ id: '2' })],
      });

      const ok = await useConceptCardsStore.getState().deleteCard('1');

      expect(ok).toBe(true);
      const { cards } = useConceptCardsStore.getState();
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe('2');
    });
  });

  describe('reviewCard', () => {
    it('advances the schedule on good', async () => {
      const card = conceptCardFactory.build({
        id: '1',
        schedule: {
          dueDate: '2026-06-16',
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lapses: 0,
        },
      });
      useConceptCardsStore.setState({ cards: [card] });

      const ok = await useConceptCardsStore.getState().reviewCard('1', 'good');

      expect(ok).toBe(true);
      const updated = useConceptCardsStore.getState().cards[0];
      expect(updated.schedule.repetitions).toBe(1);
      expect(updated.schedule.interval).toBe(1);
    });

    it('returns false for an unknown id', async () => {
      const ok = await useConceptCardsStore.getState().reviewCard('missing', 'good');

      expect(ok).toBe(false);
      expect(storage.setConceptCards).not.toHaveBeenCalled();
    });
  });

  describe('getDueCards', () => {
    it('returns only cards due on or before today', async () => {
      const past = conceptCardFactory.build({
        id: 'past',
        schedule: {
          dueDate: '2020-01-01',
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lapses: 0,
        },
      });
      const future = conceptCardFactory.build({
        id: 'future',
        schedule: {
          dueDate: '2999-01-01',
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lapses: 0,
        },
      });
      useConceptCardsStore.setState({ cards: [past, future] });

      const due = useConceptCardsStore.getState().getDueCards();

      expect(due.map((c) => c.id)).toEqual(['past']);
    });
  });
});
