import { Factory } from 'fishery';
import type { Quote, QuoteCategory } from '@cuewise/shared';

const categories: QuoteCategory[] = [
  'inspiration',
  'learning',
  'productivity',
  'mindfulness',
  'success',
  'creativity',
  'resilience',
  'leadership',
  'health',
  'growth',
];

export const quoteFactory = Factory.define<Quote>(({ sequence }) => ({
  id: `quote-${sequence}`,
  text: `Test quote ${sequence}`,
  author: `Author ${sequence}`,
  category: categories[sequence % categories.length],
  isCustom: false,
  isFavorite: false,
  isHidden: false,
  viewCount: 0,
  lastViewed: undefined,
  source: undefined,
  notes: undefined,
}));

// Named variants for common scenarios
export const customQuoteFactory = Factory.define<Quote>(({ sequence }) => ({
  ...quoteFactory.build(),
  id: `custom-${sequence}`,
  isCustom: true,
}));

export const favoriteQuoteFactory = quoteFactory.params({
  isFavorite: true,
});

export const hiddenQuoteFactory = quoteFactory.params({
  isHidden: true,
});
