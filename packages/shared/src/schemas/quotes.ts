import { z } from 'zod/mini';
import type { Quote, QuoteCollection } from '../types';
import { assertNoDrift } from './drift';

/**
 * Derived from the same union as the type, so adding a category in `types.ts` cannot leave
 * this list behind. `z.enum` needs the literal members, not the Record that keys them.
 */
export const quoteCategorySchema = z.enum([
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
]);

export const quoteSchema = z.object({
  id: z.string(),
  text: z.string(),
  author: z.string(),
  category: quoteCategorySchema,
  isCustom: z.boolean(),
  isFavorite: z.boolean(),
  isHidden: z.boolean(),
  viewCount: z.number(),
  lastViewed: z.optional(z.string()),
  source: z.optional(z.string()),
  notes: z.optional(z.string()),
  collectionIds: z.optional(z.array(z.string())),
});
assertNoDrift<z.infer<typeof quoteSchema>, Quote>();

export const quoteCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.optional(z.string()),
  createdAt: z.string(),
  updatedAt: z.optional(z.string()),
});
assertNoDrift<z.infer<typeof quoteCollectionSchema>, QuoteCollection>();
