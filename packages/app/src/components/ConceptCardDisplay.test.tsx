import { CONCEPT_GRADES } from '@cuewise/shared';
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
      onSkipToQuote={vi.fn()}
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

  it('binds a key to every grade, so adding one cannot leave it unreachable', () => {
    // Fails the moment the key list stops being derived from CONCEPT_GRADES.
    const onGrade = vi.fn();
    renderCard({ activeRecall: false, onGrade });

    for (const [index, grade] of CONCEPT_GRADES.entries()) {
      fireEvent.keyDown(document.body, { key: String(index + 1) });
      expect(onGrade).toHaveBeenCalledWith(grade.id);
    }
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

  it('reveals the answer with the space key', () => {
    renderCard();

    fireEvent.keyDown(document.body, { key: ' ' });

    expect(screen.getByText(card.definition)).toBeInTheDocument();
  });

  it('leaves space to the control that has focus, rather than revealing', () => {
    renderCard();
    const next = screen.getByRole('button', { name: 'Next' });
    next.focus();

    fireEvent.keyDown(next, { key: ' ' });

    expect(screen.queryByText(card.definition)).not.toBeInTheDocument();
  });

  it('leaves space alone while typing', () => {
    renderCard();
    render(<input aria-label="note" />);
    screen.getByLabelText('note').focus();

    fireEvent.keyDown(screen.getByLabelText('note'), { key: ' ' });

    expect(screen.queryByText(card.definition)).not.toBeInTheDocument();
  });

  it('moves on to a quote when space is pressed after the reveal', () => {
    const onSkipToQuote = vi.fn();
    renderCard({ activeRecall: false, onSkipToQuote });

    fireEvent.keyDown(document.body, { key: ' ' });

    expect(onSkipToQuote).toHaveBeenCalledTimes(1);
  });

  it('names the space shortcut on the reveal control', () => {
    renderCard();

    expect(screen.getByRole('button', { name: /reveal answer/i })).toHaveAttribute(
      'title',
      expect.stringMatching(/space/i)
    );
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
