import { describe, expect, it } from 'vitest';
import { getRandomQuote } from './utils';

describe('getRandomQuote with category filtering', () => {
  it('should filter quotes by enabled categories', () => {
    const quotes = [
      {
        id: '1',
        text: 'Quote 1',
        author: 'Author 1',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      },
      {
        id: '2',
        text: 'Quote 2',
        author: 'Author 2',
        category: 'productivity' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      },
      {
        id: '3',
        text: 'Quote 3',
        author: 'Author 3',
        category: 'learning' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      },
    ];

    // Only enable 'productivity' category
    const result = getRandomQuote(quotes, undefined, ['productivity']);

    expect(result).not.toBeNull();
    expect(result?.category).toBe('productivity');
  });

  it('should return null when no quotes match enabled categories', () => {
    const quotes = [
      {
        id: '1',
        text: 'Quote 1',
        author: 'Author 1',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      },
    ];

    // Enable a category that has no quotes
    const result = getRandomQuote(quotes, undefined, ['productivity']);

    expect(result).toBeNull();
  });

  it('should return null when enabled categories array is empty', () => {
    const quotes = [
      {
        id: '1',
        text: 'Quote 1',
        author: 'Author 1',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      },
    ];

    // Empty categories array should return null
    const result = getRandomQuote(quotes, undefined, []);

    expect(result).toBeNull();
  });

  it('should respect both hidden filter and category filter', () => {
    const quotes = [
      {
        id: '1',
        text: 'Quote 1',
        author: 'Author 1',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: true, // Hidden
        viewCount: 0,
      },
      {
        id: '2',
        text: 'Quote 2',
        author: 'Author 2',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false, // Visible
        viewCount: 0,
      },
    ];

    const result = getRandomQuote(quotes, undefined, ['inspiration']);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('2'); // Should get the non-hidden one
  });

  it('should include all quotes when enabledCategories is undefined', () => {
    const quotes = [
      {
        id: '1',
        text: 'Quote 1',
        author: 'Author 1',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      },
    ];

    const result = getRandomQuote(quotes, undefined, undefined);

    expect(result).not.toBeNull();
  });
});

describe('getRandomQuote with favorites filtering (OR logic)', () => {
  it('should include favorites when showFavorites is true (even without categories)', () => {
    const quotes = [
      {
        id: '1',
        text: 'Quote 1',
        author: 'Author 1',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: true,
        isHidden: false,
        viewCount: 0,
      },
      {
        id: '2',
        text: 'Quote 2',
        author: 'Author 2',
        category: 'productivity' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      },
    ];

    // No categories enabled, but favorites enabled - should return only favorites
    const result = getRandomQuote(quotes, undefined, [], false, true);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('1');
    expect(result?.isFavorite).toBe(true);
  });

  it('should return null when showFavorites is true but no favorites exist and no other filters', () => {
    const quotes = [
      {
        id: '1',
        text: 'Quote 1',
        author: 'Author 1',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      },
    ];

    // No categories, no custom, only favorites filter - but no favorites exist
    const result = getRandomQuote(quotes, undefined, [], false, true);

    expect(result).toBeNull();
  });

  it('should combine favorites filter with category filter using OR logic', () => {
    const quotes = [
      {
        id: '1',
        text: 'Quote 1',
        author: 'Author 1',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: true,
        isHidden: false,
        viewCount: 0,
      },
      {
        id: '2',
        text: 'Quote 2',
        author: 'Author 2',
        category: 'productivity' as const,
        isCustom: false,
        isFavorite: true,
        isHidden: false,
        viewCount: 0,
      },
      {
        id: '3',
        text: 'Quote 3',
        author: 'Author 3',
        category: 'productivity' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      },
    ];

    // productivity category OR favorites - should return quotes 2 and 3 (both productivity) and quote 1 (favorite)
    const result = getRandomQuote(quotes, undefined, ['productivity'], false, true);

    expect(result).not.toBeNull();
    // Result should be either productivity OR favorite
    const isProductivity = result?.category === 'productivity';
    const isFavorite = result?.isFavorite === true;
    expect(isProductivity || isFavorite).toBe(true);
  });

  it('should return category quotes when showFavorites is false', () => {
    const quotes = [
      {
        id: '1',
        text: 'Quote 1',
        author: 'Author 1',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: true,
        isHidden: false,
        viewCount: 0,
      },
      {
        id: '2',
        text: 'Quote 2',
        author: 'Author 2',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      },
    ];

    const result = getRandomQuote(quotes, undefined, ['inspiration'], true, false);

    expect(result).not.toBeNull();
  });

  it('should respect hidden filter combined with favorites filter', () => {
    const quotes = [
      {
        id: '1',
        text: 'Quote 1',
        author: 'Author 1',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: true,
        isHidden: true, // Hidden favorite
        viewCount: 0,
      },
      {
        id: '2',
        text: 'Quote 2',
        author: 'Author 2',
        category: 'inspiration' as const,
        isCustom: false,
        isFavorite: true,
        isHidden: false, // Visible favorite
        viewCount: 0,
      },
    ];

    const result = getRandomQuote(quotes, undefined, undefined, true, true);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('2'); // Should get the non-hidden favorite
  });
});
