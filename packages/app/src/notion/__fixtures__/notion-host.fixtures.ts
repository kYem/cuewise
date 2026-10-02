import type { NotionConnection, NotionTables } from '@cuewise/shared';
import { notionTableFactory } from '@cuewise/test-utils/factories';
import { vi } from 'vitest';
import type { NotionApi, NotionHost } from '../notion-host';

export const NOTION_RETURN_URI = 'https://ext.chromiumapp.org/notion';

export const connectedWithTable: NotionConnection = {
  workspace: 'Acme',
  dataSourceId: '3f9a855f-8bd8-4d4c-a3a4-caf40bac8df2',
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
    disconnectNotion: vi.fn<NotionApi['disconnectNotion']>(async () => undefined),
  };
  return {
    api,
    authorize: vi.fn(async (start: (returnUri: string) => Promise<string>) => {
      await start(NOTION_RETURN_URI);
      return redirect;
    }),
  };
}
