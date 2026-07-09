import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptCardDisplay } from './ConceptCardDisplay';

const card = conceptCardFactory.build({
  term: 'Saga pattern',
  definition: 'A sequence of local transactions with compensating actions.',
});

type CardProps = Parameters<typeof ConceptCardDisplay>[0];

// Supplies the required nav/favorite props; tests override only what they assert.
function renderCard(props: Partial<CardProps> = {}) {
  return render(
    <ConceptCardDisplay
      card={card}
      activeRecall
      onGrade={vi.fn()}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      isFavorite={false}
      onToggleFavorite={vi.fn()}
      dueCount={0}
      {...props}
    />
  );
}

describe('ConceptCardDisplay', () => {
  it('shows the term and a reveal button in active recall, hiding the definition', () => {
    renderCard();

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reveal answer/i })).toBeInTheDocument();
    expect(screen.queryByText(card.definition)).not.toBeInTheDocument();
  });

  it('reveals the definition and three grade buttons', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }));

    expect(screen.getByText(card.definition)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /good/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /easy/i })).toBeInTheDocument();
  });

  it('calls onGrade with the chosen grade', () => {
    const onGrade = vi.fn();
    renderCard({ onGrade });

    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole('button', { name: /good/i }));

    expect(onGrade).toHaveBeenCalledWith('good');
  });

  it('grades with the 1/2/3 keys once the answer is revealed', () => {
    const onGrade = vi.fn();
    renderCard({ activeRecall: false, onGrade });

    fireEvent.keyDown(document.body, { key: '1' });
    expect(onGrade).toHaveBeenCalledWith('again');

    fireEvent.keyDown(document.body, { key: '2' });
    expect(onGrade).toHaveBeenCalledWith('good');

    fireEvent.keyDown(document.body, { key: '3' });
    expect(onGrade).toHaveBeenCalledWith('easy');
  });

  it('ignores the number keys until the answer is revealed', () => {
    const onGrade = vi.fn();
    renderCard({ onGrade });

    fireEvent.keyDown(document.body, { key: '2' });

    expect(onGrade).not.toHaveBeenCalled();
  });

  it('shows the definition upfront when active recall is off', () => {
    renderCard({ activeRecall: false });

    expect(screen.getByText(card.definition)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal answer/i })).not.toBeInTheDocument();
  });

  it('toggles favorite from the toolbar', () => {
    const onToggleFavorite = vi.fn();
    renderCard({ onToggleFavorite });

    fireEvent.click(screen.getByRole('button', { name: /^favorite$/i }));

    expect(onToggleFavorite).toHaveBeenCalled();
  });
});
