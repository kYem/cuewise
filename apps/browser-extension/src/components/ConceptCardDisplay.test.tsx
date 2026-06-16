import { conceptCardFactory } from '@cuewise/test-utils/factories';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConceptCardDisplay } from './ConceptCardDisplay';

const card = conceptCardFactory.build({
  term: 'Saga pattern',
  definition: 'A sequence of local transactions with compensating actions.',
});

describe('ConceptCardDisplay', () => {
  it('shows the term and a reveal button in active recall, hiding the definition', () => {
    render(<ConceptCardDisplay card={card} activeRecall onGrade={vi.fn()} />);

    expect(screen.getByText('Saga pattern')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reveal answer/i })).toBeInTheDocument();
    expect(screen.queryByText(card.definition)).not.toBeInTheDocument();
  });

  it('reveals the definition and three grade buttons', () => {
    render(<ConceptCardDisplay card={card} activeRecall onGrade={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }));

    expect(screen.getByText(card.definition)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /good/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /easy/i })).toBeInTheDocument();
  });

  it('calls onGrade with the chosen grade', () => {
    const onGrade = vi.fn();
    render(<ConceptCardDisplay card={card} activeRecall onGrade={onGrade} />);

    fireEvent.click(screen.getByRole('button', { name: /reveal answer/i }));
    fireEvent.click(screen.getByRole('button', { name: /good/i }));

    expect(onGrade).toHaveBeenCalledWith('good');
  });

  it('shows the definition upfront when active recall is off', () => {
    render(<ConceptCardDisplay card={card} activeRecall={false} onGrade={vi.fn()} />);

    expect(screen.getByText(card.definition)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal answer/i })).not.toBeInTheDocument();
  });
});
