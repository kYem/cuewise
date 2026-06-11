import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoalProgressRing } from './GoalProgressRing';

describe('GoalProgressRing', () => {
  it('renders the completed/total fraction', () => {
    render(<GoalProgressRing completed={2} total={5} />);

    expect(screen.getByText('2/5')).toBeInTheDocument();
  });

  it('exposes an accessible completion label', () => {
    render(<GoalProgressRing completed={3} total={4} />);

    expect(screen.getByRole('img', { name: '3 of 4 goals completed' })).toBeInTheDocument();
  });

  it('handles an empty list without dividing by zero', () => {
    render(<GoalProgressRing completed={0} total={0} />);

    expect(screen.getByText('0/0')).toBeInTheDocument();
  });
});
