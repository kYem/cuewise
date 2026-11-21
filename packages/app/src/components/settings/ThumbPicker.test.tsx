import { ALL_FOCUS_IMAGE_CATEGORIES, FOCUS_IMAGE_CATEGORIES } from '@cuewise/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CURATED_PHOTOS } from '../../utils/unsplash-catalog';
import { ThumbPicker } from './ThumbPicker';

function tileStyle(category: (typeof ALL_FOCUS_IMAGE_CATEGORIES)[number]): string {
  render(<ThumbPicker value="nature" onChange={vi.fn()} />);
  const tile = screen.getByRole('button', { name: FOCUS_IMAGE_CATEGORIES[category] });
  return tile.getAttribute('style') ?? '';
}

describe('ThumbPicker', () => {
  it.each(ALL_FOCUS_IMAGE_CATEGORIES)('shows a %s photo from its own catalog', (category) => {
    const style = tileStyle(category);
    const ids = CURATED_PHOTOS[category].map((photo) => photo.id);

    expect(ids.some((id) => style.includes(`https://images.unsplash.com/${id}?`))).toBe(true);
  });

  it('requests a thumbnail-sized image, not the full wallpaper', () => {
    expect(tileStyle('cars')).toContain('w=200&h=112&fit=crop&auto=format');
  });

  it('marks only the chosen theme as selected', () => {
    render(<ThumbPicker value="classical" onChange={vi.fn()} />);
    expect(screen.getAllByRole('button', { pressed: true })).toEqual([
      screen.getByRole('button', { name: 'Classical' }),
    ]);
  });

  it('reports the picked theme', () => {
    const onChange = vi.fn();
    render(<ThumbPicker value="nature" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'AI' }));

    expect(onChange).toHaveBeenCalledWith('ai');
  });
});
