import { ALL_FOCUS_IMAGE_CATEGORIES, FOCUS_IMAGE_CATEGORIES } from '@cuewise/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThumbPicker } from './ThumbPicker';

describe('ThumbPicker', () => {
  it.each(ALL_FOCUS_IMAGE_CATEGORIES)('offers a %s tile with a photo thumbnail', (category) => {
    render(<ThumbPicker value="nature" onChange={vi.fn()} />);
    const tile = screen.getByRole('button', { name: FOCUS_IMAGE_CATEGORIES[category] });
    expect(tile.getAttribute('style')).toContain('https://images.unsplash.com/photo-');
  });

  it('marks only the chosen theme as selected', () => {
    render(<ThumbPicker value="classical" onChange={vi.fn()} />);
    expect(screen.getAllByRole('button', { pressed: true })).toEqual([
      screen.getByRole('button', { name: 'Classical' }),
    ]);
  });
});
