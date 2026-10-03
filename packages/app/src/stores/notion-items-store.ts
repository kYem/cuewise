import { logger, type NotionItem } from '@cuewise/shared';
import { create } from 'zustand';
import type { NotionHost } from '../notion/notion-host';
import { NOTION_UNREACHABLE, problemCode } from './notion-store';
import { useToastStore } from './toast-store';

/** Why the list cannot be shown; each sends the user to Settings except `failed`, which retries. */
export type NotionListBlock =
  | 'unavailable'
  | 'disconnected'
  | 'reauth'
  | 'unselected'
  | 'table_unavailable'
  | 'schema_unusable'
  | 'failed';

export type NotionList =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'blocked'; reason: NotionListBlock }
  | {
      status: 'ready';
      /** The table the rows were read from, so a table change reads again. */
      tableId: string;
      items: NotionItem[];
      truncated: boolean;
      fetchedAt: string;
      /** The last refresh or tick failed, so the rows may be out of date. */
      stale: boolean;
    };

interface NotionItemsStore {
  list: NotionList;
  /** Rows whose tick is still saving; their checkboxes wait for it. */
  saving: ReadonlySet<string>;
  load: (host: NotionHost, tableId: string) => Promise<void>;
  setDone: (host: NotionHost, pageId: string, done: boolean) => Promise<void>;
}

const BLOCKS: ReadonlyMap<string, NotionListBlock> = new Map([
  ['invalid_token', 'unavailable'],
  ['unauthorized', 'unavailable'],
  ['provider_not_connected', 'disconnected'],
  ['provider_reauth_required', 'reauth'],
  ['provider_table_unselected', 'unselected'],
  ['provider_table_unavailable', 'table_unavailable'],
  ['provider_schema_unusable', 'schema_unusable'],
]);

function blockFor(error: unknown): NotionListBlock | null {
  return BLOCKS.get(problemCode(error) ?? '') ?? null;
}

// Failures that say nothing is wrong with the table or with Cuewise: retry later.
const TRANSIENT: ReadonlySet<string> = new Set([
  'upstream_unavailable',
  'network_error',
  'rate_limited',
]);

function withDone(items: NotionItem[], pageId: string, done: boolean): NotionItem[] {
  return items.map((item) => (item.pageId === pageId ? { ...item, done } : item));
}

function without<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

export const useNotionItemsStore = create<NotionItemsStore>((set, get) => {
  // Only the newest read may land, so a slow one cannot overwrite a table change.
  let latestRead = 0;
  // The read each row's last tick started under: a read sent before the tick predates it.
  const tickedDuring = new Map<string, number>();

  return {
    list: { status: 'idle' },
    saving: new Set(),

    load: async (host, tableId) => {
      const read = ++latestRead;
      const shown = get().list;
      if (shown.status !== 'ready' || shown.tableId !== tableId) {
        set({ list: { status: 'loading' } });
      }
      try {
        const found = await host.api.listNotionItems();
        if (read !== latestRead) {
          return;
        }
        const { list, saving } = get();
        // A tick still saving, or made after this read was sent, keeps its value over the read.
        const items = found.items.map((item) => {
          const ticked = (tickedDuring.get(item.pageId) ?? 0) >= read;
          if (list.status !== 'ready' || !(saving.has(item.pageId) || ticked)) {
            return item;
          }
          return list.items.find((mine) => mine.pageId === item.pageId) ?? item;
        });
        set({
          list: {
            status: 'ready',
            tableId,
            items,
            truncated: found.truncated,
            fetchedAt: new Date().toISOString(),
            stale: false,
          },
        });
      } catch (error) {
        if (read !== latestRead) {
          return;
        }
        const reason = blockFor(error);
        if (reason !== null) {
          logger.warn(`Notion tasks unavailable (${problemCode(error)})`);
          set({ list: { status: 'blocked', reason } });
          return;
        }
        const list = get().list;
        if (list.status === 'ready' && list.tableId === tableId) {
          if (TRANSIENT.has(problemCode(error) ?? '')) {
            logger.warn('Notion tasks refresh failed; keeping the last read', { error });
          } else {
            logger.error('Notion tasks refresh failed; keeping the last read', error);
          }
          set({ list: { ...list, stale: true } });
          return;
        }
        logger.error('Failed to read the Notion tasks', error);
        set({ list: { status: 'blocked', reason: 'failed' } });
      }
    },

    setDone: async (host, pageId, done) => {
      const { list, saving } = get();
      if (list.status !== 'ready' || saving.has(pageId)) {
        return;
      }
      tickedDuring.set(pageId, latestRead);
      set({
        list: { ...list, items: withDone(list.items, pageId, done) },
        saving: new Set(saving).add(pageId),
      });
      try {
        await host.api.setNotionItemDone(pageId, done);
        set({ saving: without(get().saving, pageId) });
        // Notion answered, so a stale notice is out of date too: read again to clear it.
        const latest = get().list;
        if (latest.status === 'ready' && latest.stale) {
          await get().load(host, latest.tableId);
        }
      } catch (error) {
        const shown = get().list;
        set({
          list:
            shown.status === 'ready'
              ? { ...shown, items: withDone(shown.items, pageId, !done) }
              : shown,
          saving: without(get().saving, pageId),
        });
        const code = problemCode(error);
        const toast = useToastStore.getState();
        if (code === 'not_found') {
          logger.warn('Notion task is gone; dropping the row');
          toast.warning('That task is no longer in the Notion table.');
          const latest = get().list;
          if (latest.status === 'ready') {
            set({
              list: { ...latest, items: latest.items.filter((item) => item.pageId !== pageId) },
            });
            await get().load(host, latest.tableId);
          }
          return;
        }
        if (code === 'provider_todo_group_missing') {
          logger.warn('Notion table has no To-do status to reopen a task into');
          toast.error('This table has no To-do status to move the task back to.');
          return;
        }
        if (code === 'provider_write_forbidden') {
          logger.warn('Notion refused the write to a task');
          toast.error("Notion didn't let Cuewise change this task.");
          return;
        }
        const reason = blockFor(error);
        if (reason !== null) {
          logger.warn(`Notion task write blocked (${code})`);
          set({ list: { status: 'blocked', reason } });
          return;
        }
        if (TRANSIENT.has(code ?? '')) {
          logger.warn('Notion unreachable while saving a task', { error });
          const latest = get().list;
          if (latest.status === 'ready') {
            set({ list: { ...latest, stale: true } });
          }
          toast.error(NOTION_UNREACHABLE);
          return;
        }
        logger.error('Failed to save a Notion task', error);
        toast.error("Couldn't update the task in Notion.");
      }
    },
  };
});
