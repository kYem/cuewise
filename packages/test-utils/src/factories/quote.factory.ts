import type { Quote, QuoteCategory } from '@cuewise/shared';
import { Factory } from 'fishery';

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
