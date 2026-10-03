import type { NotionItem, NotionTable } from '@cuewise/shared';
import { Factory } from 'fishery';

export const notionTableFactory = Factory.define<NotionTable>(({ sequence }) => ({
  id: `3f9a855f-8bd8-4d4c-a3a4-${String(sequence).padStart(12, '0')}`,
  name: `Table ${sequence}`,
}));

export const notionItemFactory = Factory.define<NotionItem>(({ sequence }) => ({
  pageId: `9b1e4c2a-7d3f-4a5b-8c6d-${String(sequence).padStart(12, '0')}`,
  text: `Task ${sequence}`,
  done: false,
}));
