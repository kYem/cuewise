import type { ConceptCard } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
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
