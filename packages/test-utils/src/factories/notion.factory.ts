import type { NotionTable } from '@cuewise/shared';
import { Factory } from 'fishery';

export const notionTableFactory = Factory.define<NotionTable>(({ sequence }) => ({
  id: `3f9a855f-8bd8-4d4c-a3a4-${String(sequence).padStart(12, '0')}`,
  name: `Table ${sequence}`,
}));
