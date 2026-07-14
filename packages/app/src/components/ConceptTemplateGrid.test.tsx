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
      expect(screen.getAllByText(`${template.cards.length} cards`).length).toBeGreaterThan(0);
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

    // Exactly one — a second "Added" would mean cross-pack contamination.
    const addedButtons = screen.getAllByRole('button', { name: 'Added' });
    expect(addedButtons).toHaveLength(1);
    expect(addedButtons[0]).toBeDisabled();
  });

  it('warns and keeps the picker open when everything was already in the deck', async () => {
    const addCards = vi.fn().mockResolvedValue(0);
    mockStore([], addCards);
    const onAdded = vi.fn();

    render(<ConceptTemplateGrid onAdded={onAdded} />);

    fireEvent.click(screen.getAllByRole('button', { name: /add pack/i })[0]);
    await vi.waitFor(() => expect(warningToast).toHaveBeenCalled());

    expect(onAdded).not.toHaveBeenCalled();
    expect(successToast).not.toHaveBeenCalled();
  });

  it('stays quiet on a failed save — the store already reported it', async () => {
    const addCards = vi.fn().mockResolvedValue(null);
    mockStore([], addCards);
    const onAdded = vi.fn();

    render(<ConceptTemplateGrid onAdded={onAdded} />);

    fireEvent.click(screen.getAllByRole('button', { name: /add pack/i })[0]);
    await vi.waitFor(() => expect(addCards).toHaveBeenCalledOnce());

    expect(warningToast).not.toHaveBeenCalled();
    expect(successToast).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });
});
