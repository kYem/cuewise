import type { ConceptCard } from '@cuewise/shared';
import { Factory } from 'fishery';

export const conceptCardFactory = Factory.define<ConceptCard>(({ sequence }) => ({
  id: `concept-${sequence}`,
  term: `Concept ${sequence}`,
  definition: `Definition for concept ${sequence}`,
  details: undefined,
  tags: undefined,
  source: undefined,
  createdAt: '2026-06-01T00:00:00.000Z',
  schedule: {
    dueDate: '2026-06-16',
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
  },
}));
