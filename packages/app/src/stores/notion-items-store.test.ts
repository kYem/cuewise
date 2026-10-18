import type { NotionItems } from '@cuewise/shared';
import { notionItemFactory } from '@cuewise/test-utils/factories';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeNotionHost,
  itemsOf,
  problem,
  TABLE_ID,
} from '../notion/__fixtures__/notion-host.fixtures';
import { deferred } from './__fixtures__/weather-store.fixtures';
import { type NotionList, useNotionItemsStore } from './notion-items-store';
import { NOTION_UNREACHABLE } from './notion-store';

const errorToast = vi.fn();
const warningToast = vi.fn();
vi.mock('./toast-store', () => ({
  useToastStore: {
    getState: () => ({ error: errorToast, warning: warningToast, success: vi.fn() }),
  },
}));

const brief = notionItemFactory.build({ text: 'Write the brief' });
const review = notionItemFactory.build({ text: 'Review the draft' });

function shownItems(): unknown {
  const list = useNotionItemsStore.getState().list;
  return list.status === 'ready' ? list.items : list;
}

async function loaded(host = fakeNotionHost()) {
  host.api.listNotionItems.mockResolvedValue(itemsOf([brief, review]));
  await useNotionItemsStore.getState().load(host, TABLE_ID);
  return host;
}

beforeEach(() => {
  vi.clearAllMocks();
  useNotionItemsStore.setState({ list: { status: 'idle' }, saving: new Set() });
});

describe('load', () => {
  it('keeps the rows in Notion order for the table it read', async () => {
    await loaded();

    expect(useNotionItemsStore.getState().list).toMatchObject({
      status: 'ready',
      tableId: TABLE_ID,
      items: [brief, review],
      truncated: false,
      stale: false,
    });
  });

  it.each<[string, NotionList]>([
    ['unauthorized', { status: 'blocked', reason: 'unavailable' }],
    ['provider_not_connected', { status: 'blocked', reason: 'disconnected' }],
    ['provider_reauth_required', { status: 'blocked', reason: 'reauth' }],
    ['provider_table_unselected', { status: 'blocked', reason: 'unselected' }],
    ['provider_table_unavailable', { status: 'blocked', reason: 'table_unavailable' }],
    ['provider_schema_unusable', { status: 'blocked', reason: 'schema_unusable' }],
    ['upstream_unavailable', { status: 'blocked', reason: 'failed' }],
  ])('shows %s on a first read as %o', async (code, expected) => {
    const host = fakeNotionHost();
    host.api.listNotionItems.mockRejectedValue(problem(code));

    await useNotionItemsStore.getState().load(host, TABLE_ID);

    expect(useNotionItemsStore.getState().list).toEqual(expected);
  });

  it.each(['upstream_unavailable', 'network_error', 'internal'])(
    'keeps the last rows, marked stale, when a refresh fails with %s',
    async (code) => {
      const host = await loaded();
      host.api.listNotionItems.mockRejectedValue(problem(code));

      await useNotionItemsStore.getState().load(host, TABLE_ID);

      expect(useNotionItemsStore.getState().list).toMatchObject({
        items: [brief, review],
        stale: true,
      });
    }
  );

  it('drops a slower read that a newer one overtook', async () => {
    const host = fakeNotionHost();
    const slow = deferred<NotionItems>();
    host.api.listNotionItems
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(itemsOf([review]));

    const first = useNotionItemsStore.getState().load(host, 'old-table');
    await useNotionItemsStore.getState().load(host, TABLE_ID);
    slow.release(itemsOf([brief]));
    await first;

    expect(useNotionItemsStore.getState().list).toMatchObject({
      tableId: TABLE_ID,
      items: [review],
    });
  });
});

describe('setDone', () => {
  it('ticks the row at once and writes it to Notion', async () => {
    const host = await loaded();

    await useNotionItemsStore.getState().setDone(host, brief.pageId, true);

    expect(host.api.setNotionItemDone).toHaveBeenCalledExactlyOnceWith(brief.pageId, true);
    expect(shownItems()).toEqual([{ ...brief, done: true }, review]);
    expect(useNotionItemsStore.getState().saving.size).toBe(0);
  });

  it('holds the row as saving until Notion answers, ignoring a second tick', async () => {
    const host = await loaded();
    const write = deferred<void>();
    host.api.setNotionItemDone.mockReturnValueOnce(write.promise);

    const ticking = useNotionItemsStore.getState().setDone(host, brief.pageId, true);
    await useNotionItemsStore.getState().setDone(host, brief.pageId, false);

    expect(useNotionItemsStore.getState().saving.has(brief.pageId)).toBe(true);
    expect(host.api.setNotionItemDone).toHaveBeenCalledOnce();
    write.release();
    await ticking;
    expect(useNotionItemsStore.getState().saving.has(brief.pageId)).toBe(false);
  });

  it('keeps a saving tick over a refresh that raced it', async () => {
    const host = await loaded();
    const write = deferred<void>();
    host.api.setNotionItemDone.mockReturnValueOnce(write.promise);

    const ticking = useNotionItemsStore.getState().setDone(host, brief.pageId, true);
    await useNotionItemsStore.getState().load(host, TABLE_ID);

    expect(shownItems()).toEqual([{ ...brief, done: true }, review]);
    write.release();
    await ticking;
  });

  it('keeps a tick made while an earlier read was still on its way', async () => {
    const host = await loaded();
    const slow = deferred<NotionItems>();
    host.api.listNotionItems.mockReturnValueOnce(slow.promise);

    const reading = useNotionItemsStore.getState().load(host, TABLE_ID);
    await useNotionItemsStore.getState().setDone(host, brief.pageId, true);
    slow.release(itemsOf([brief, review]));
    await reading;

    expect(shownItems()).toEqual([{ ...brief, done: true }, review]);
  });

  it('keeps a tick over a read sent while it was saving', async () => {
    const host = await loaded();
    const write = deferred<void>();
    const slow = deferred<NotionItems>();
    host.api.setNotionItemDone.mockReturnValueOnce(write.promise);
    host.api.listNotionItems.mockReturnValueOnce(slow.promise);

    const ticking = useNotionItemsStore.getState().setDone(host, brief.pageId, true);
    const reading = useNotionItemsStore.getState().load(host, TABLE_ID);
    write.release();
    await ticking;
    slow.release(itemsOf([brief, review]));
    await reading;

    expect(shownItems()).toEqual([{ ...brief, done: true }, review]);
  });

  it('reads the table again once a tick lands on a stale list', async () => {
    const host = await loaded();
    host.api.listNotionItems.mockRejectedValueOnce(problem('upstream_unavailable'));
    await useNotionItemsStore.getState().load(host, TABLE_ID);

    await useNotionItemsStore.getState().setDone(host, brief.pageId, true);

    expect(host.api.listNotionItems).toHaveBeenCalledTimes(3);
    expect(useNotionItemsStore.getState().list).toMatchObject({ stale: false });
  });

  it.each([
    ['provider_todo_group_missing', 'This table has no To-do status to move the task back to.'],
    ['provider_write_forbidden', "Notion didn't let Cuewise change this task."],
    ['upstream_unavailable', NOTION_UNREACHABLE],
    ['network_error', NOTION_UNREACHABLE],
    ['internal', "Couldn't update the task in Notion."],
  ])('rolls the tick back and says why on %s', async (code, message) => {
    const host = await loaded();
    host.api.setNotionItemDone.mockRejectedValue(problem(code));

    await useNotionItemsStore.getState().setDone(host, brief.pageId, true);

    expect(shownItems()).toEqual([brief, review]);
    expect(errorToast).toHaveBeenCalledExactlyOnceWith(message);
  });

  it.each(['upstream_unavailable', 'network_error'])(
    'marks the list stale when a tick fails with %s',
    async (code) => {
      const host = await loaded();
      host.api.setNotionItemDone.mockRejectedValue(problem(code));

      await useNotionItemsStore.getState().setDone(host, brief.pageId, true);

      expect(useNotionItemsStore.getState().list).toMatchObject({ stale: true });
    }
  );

  it('drops a row Notion no longer has, then reads the table again', async () => {
    const host = await loaded();
    host.api.setNotionItemDone.mockRejectedValue(problem('not_found'));
    host.api.listNotionItems.mockResolvedValue(itemsOf([review]));

    await useNotionItemsStore.getState().setDone(host, brief.pageId, true);

    expect(host.api.listNotionItems).toHaveBeenCalledTimes(2);
    expect(shownItems()).toEqual([review]);
    expect(warningToast).toHaveBeenCalledOnce();
  });

  it('hands a connection fault to the card instead of the list', async () => {
    const host = await loaded();
    host.api.setNotionItemDone.mockRejectedValue(problem('provider_reauth_required'));

    await useNotionItemsStore.getState().setDone(host, brief.pageId, true);

    expect(useNotionItemsStore.getState().list).toEqual({ status: 'blocked', reason: 'reauth' });
    expect(errorToast).not.toHaveBeenCalled();
  });
});
