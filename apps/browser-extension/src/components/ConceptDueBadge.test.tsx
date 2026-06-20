import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConceptDueBadge } from './ConceptDueBadge';

describe('ConceptDueBadge', () => {
  it('shows the count when cards are due', () => {
    render(<ConceptDueBadge count={3} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByLabelText('3 concept cards due')).toBeInTheDocument();
  });

  it('uses singular wording for one due card', () => {
    render(<ConceptDueBadge count={1} />);

    expect(screen.getByLabelText('1 concept card due')).toBeInTheDocument();
  });

  it('renders nothing when none are due', () => {
    const { container } = render(<ConceptDueBadge count={0} />);

    expect(container).toBeEmptyDOMElement();
  });
});
