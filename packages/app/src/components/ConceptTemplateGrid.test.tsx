import { CONCEPT_TEMPLATES } from '@cuewise/shared';
import { createSelectorMock } from '@cuewise/test-utils';
import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConceptCardsStore } from '../stores/concept-cards-store';
import { ConceptTemplateGrid } from './ConceptTemplateGrid';

vi.mock('../stores/concept-cards-store', () => ({ useConceptCardsStore: vi.fn() }));

const successToast = vi.fn();
const warningToast = vi.fn();
vi.mock('../stores/toast-store', () => ({
  useToastStore: {
    getState: () => ({ success: successToast, warning: warningToast, error: vi.fn() }),
  },
}));

const firstPack = CONCEPT_TEMPLATES[0];

function mockStore(cards: ReturnType<typeof conceptCardFactory.build>[], addCards = vi.fn()) {
  vi.mocked(useConceptCardsStore).mockImplementation(createSelectorMock({ cards, addCards }));
  return { addCards };
}

describe('ConceptTemplateGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders every starter pack with its card count', () => {
    mockStore([]);

    render(<ConceptTemplateGrid />);

    for (const template of CONCEPT_TEMPLATES) {
      expect(screen.getByText(template.name)).toBeInTheDocument();
    }
  });

  it('adds the whole pack, tags each card, and reports success', async () => {
    const addCards = vi.fn().mockResolvedValue(firstPack.cards.length);
    mockStore([], addCards);
    const onAdded = vi.fn();

    render(<ConceptTemplateGrid onAdded={onAdded} />);

    fireEvent.click(screen.getAllByRole('button', { name: /add pack/i })[0]);
    await vi.waitFor(() => expect(addCards).toHaveBeenCalledOnce());

    const inputs = addCards.mock.calls[0][0];
    expect(inputs).toHaveLength(firstPack.cards.length);
    expect(inputs[0]).toMatchObject({
      term: firstPack.cards[0].term,
      extras: { tags: [firstPack.tag] },
    });
    await vi.waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(successToast).toHaveBeenCalled();
  });

  it('disables a pack already fully in the deck', () => {
    const owned = firstPack.cards.map((card, i) =>
      conceptCardFactory.build({ id: `c${i}`, term: card.term })
    );
    mockStore(owned);

    render(<ConceptTemplateGrid />);

    const addedButtons = screen.getAllByRole('button', { name: 'Added' });
    expect(addedButtons.length).toBeGreaterThan(0);
    expect(addedButtons[0]).toBeDisabled();
  });
});
