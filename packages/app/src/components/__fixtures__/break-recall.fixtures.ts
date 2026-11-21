import type { ConceptCard } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { vi } from 'vitest';
import { useConceptCardsStore } from '../../stores/concept-cards-store';
import { useSettingsStore } from '../../stores/settings-store';

interface BreakRecallSetup {
  cards: ConceptCard[];
  conceptCardsEnabled?: boolean;
  conceptBreakRecall?: boolean;
  isLoading?: boolean;
}

/** Mocks the settings + concept stores BreakRecall reads; returns the store actions to assert on. */
export function setupBreakRecall({
  cards,
  conceptCardsEnabled = true,
  conceptBreakRecall = true,
  isLoading = false,
}: BreakRecallSetup) {
  vi.mocked(useSettingsStore).mockImplementation(
    createSelectorMock({
      settings: { ...defaultSettings, conceptCardsEnabled, conceptBreakRecall },
    })
  );
  const reviewCard = vi.fn().mockResolvedValue(true);
  const initialize = vi.fn();
  vi.mocked(useConceptCardsStore).mockImplementation(
    createSelectorMock({ cards, isLoading, initialize, reviewCard, toggleFavorite: vi.fn() })
  );
  return { reviewCard, initialize };
}

/** Cards already reviewed and scheduled far ahead, so none is due. */
export function notDueConceptCards(count: number): ConceptCard[] {
  return conceptCardFactory.buildList(count, {
    schedule: { dueDate: '2999-01-01', interval: 6, easeFactor: 2.5, repetitions: 2, lapses: 0 },
  });
}
