import { type ConceptCard, configurePlatform } from '@cuewise/shared';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getConceptCards, setConceptCards, updateConceptCards } from './concept-cards';
import { LocalStorageKeyValueStore } from './local-storage-key-value-store';
import { resetSettingsMigration } from './settings';

// The migration memo lives at module scope, so an earlier test's run would satisfy a later one.
beforeEach(() => {
  vi.restoreAllMocks();
  resetSettingsMigration();
});

describe('updateConceptCards', () => {
  // Two tabs write at once — one saves a captured card, the other reviews one — so without the
  // lock whoever lands second erases the other's write.
  it('lets two concurrent writers both land', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    const [first, second] = conceptCardFactory.buildList(2);
    await setConceptCards([]);

    await Promise.all([
      updateConceptCards((cards) => [...cards, first]),
      updateConceptCards((cards) => [...cards, second]),
    ]);

    const stored = await getConceptCards();
    expect(stored.map((card) => card.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('mutates the stored list, never one the caller supplied', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    const existing = conceptCardFactory.build();
    await setConceptCards([existing]);

    const { cards } = await updateConceptCards((current) => current);

    expect(cards.map((card) => card.id)).toEqual([existing.id]);
  });

  it('calls mutate exactly once, so ids collected inside it are the ids written', async () => {
    configurePlatform({ storage: new LocalStorageKeyValueStore() });
    await setConceptCards([]);
    const mutate = vi.fn((cards: ConceptCard[]) => [...cards, conceptCardFactory.build()]);

    await updateConceptCards(mutate);

    expect(mutate).toHaveBeenCalledOnce();
  });
});
