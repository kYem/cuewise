import type { NotionConnection, NotionItem, NotionItems, NotionTables } from '@cuewise/shared';
import { notionTableFactory } from '@cuewise/test-utils/factories';
import { vi } from 'vitest';
import type { NotionApi, NotionHost } from '../notion-host';

export const NOTION_RETURN_URI = 'https://ext.chromiumapp.org/notion';

export const TABLE_ID = '3f9a855f-8bd8-4d4c-a3a4-caf40bac8df2';

export const connectedWithTable: NotionConnection = {
  workspace: 'Acme',
  dataSourceId: TABLE_ID,
  tableName: 'Tasks',
};

export const connectedWithoutTable: NotionConnection = {
  workspace: 'Acme',
  dataSourceId: null,
  tableName: null,
};

export function tablesOf(count: number, truncated = false): NotionTables {
  return { workspace: 'Acme', tables: notionTableFactory.buildList(count), truncated };
}

export function itemsOf(items: NotionItem[], truncated = false): NotionItems {
  return { workspace: 'Acme', items, truncated };
}

/** A thrown `ApiError` as the store sees it: only its problem code matters. */
export function problem(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

/** The URL Notion's consent returns to, carrying the query the Worker sets. */
export function returnedWith(query: Record<string, string>): string {
  return `${NOTION_RETURN_URI}?${new URLSearchParams(query)}`;
}

export interface FakeNotionHost extends NotionHost {
  readonly api: { [K in keyof NotionApi]: ReturnType<typeof vi.fn<NotionApi[K]>> };
  readonly authorize: ReturnType<typeof vi.fn<NotionHost['authorize']>>;
}

/** Not connected yet; consent returns a code, and the workspace shares one table. */
export function fakeNotionHost(
  redirect: string | null = returnedWith({ code: 'one-time-code' })
): FakeNotionHost {
  const api = {
    getNotionConnection: vi.fn<NotionApi['getNotionConnection']>(async () => null),
    startNotion: vi.fn<NotionApi['startNotion']>(async () => 'https://api.notion.com/authorize'),
    claimNotion: vi.fn<NotionApi['claimNotion']>(async () => undefined),
    listNotionTables: vi.fn<NotionApi['listNotionTables']>(async () => tablesOf(1)),
    selectNotionTable: vi.fn<NotionApi['selectNotionTable']>(async () => undefined),
    listNotionItems: vi.fn<NotionApi['listNotionItems']>(async () => itemsOf([])),
    setNotionItemDone: vi.fn<NotionApi['setNotionItemDone']>(async () => undefined),
    disconnectNotion: vi.fn<NotionApi['disconnectNotion']>(async () => undefined),
  };
  return {
    api,
    authorize: vi.fn<NotionHost['authorize']>(async (start) => {
      await start(NOTION_RETURN_URI);
      return redirect;
    }),
  };
}

export interface CancellableNotionHost extends FakeNotionHost {
  readonly cancel: ReturnType<typeof vi.fn<() => void>>;
}

/** Consent stays open until `cancel()`, which makes the pending authorize() answer null. */
export function cancellableNotionHost(): CancellableNotionHost {
  const host = fakeNotionHost();
  let abandon: () => void = () => undefined;
  host.authorize.mockImplementation(
    (start) =>
      new Promise((resolve) => {
        abandon = () => resolve(null);
        void start(NOTION_RETURN_URI);
      })
  );
  return { ...host, cancel: vi.fn(() => abandon()) };
}
