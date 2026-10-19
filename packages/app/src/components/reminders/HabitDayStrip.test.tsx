import type { HabitDayCell } from '@cuewise/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HabitDayStrip } from './HabitDayStrip';

const cells: HabitDayCell[] = [
  { date: '2026-10-02', state: 'kept', count: 1 },
  { date: '2026-10-03', state: 'partial', count: 1 },
  { date: '2026-10-04', state: 'missed', count: 0 },
  { date: '2026-10-05', state: 'off', count: 0 },
];

function shapeOf(date: string) {
  return screen.getByTestId(`habit-day-${date}`).dataset.shape;
}

describe('HabitDayStrip', () => {
  it('summarises the kept days for screen readers', () => {
    render(<HabitDayStrip cells={cells} label="Drink water" />);

    expect(
      screen.getByRole('img', { name: 'Drink water: 1 of the last 4 days kept' })
    ).toBeInTheDocument();
  });

  it('tells day states apart by shape, not only shade', () => {
    render(<HabitDayStrip cells={cells} label="Drink water" />);

    expect(shapeOf('2026-10-02')).toBe('full');
    expect(shapeOf('2026-10-03')).toBe('half');
    expect(shapeOf('2026-10-04')).toBe('outline');
    expect(shapeOf('2026-10-05')).toBe('empty');
  });
});
