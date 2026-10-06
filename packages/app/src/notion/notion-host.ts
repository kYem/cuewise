import type { NotionConnection, NotionItems, NotionTables } from '@cuewise/shared';

/** The Notion routes of the sync API client, declared structurally so this package stays off it. */
export interface NotionApi {
  getNotionConnection(): Promise<NotionConnection | null>;
  startNotion(returnUri: string, codeChallenge: string): Promise<string>;
  claimNotion(code: string, codeVerifier: string): Promise<void>;
  listNotionTables(): Promise<NotionTables>;
  selectNotionTable(dataSourceId: string, name: string): Promise<void>;
  listNotionItems(): Promise<NotionItems>;
  setNotionItemDone(pageId: string, done: boolean): Promise<void>;
  disconnectNotion(): Promise<void>;
}

/** What a host supplies to connect Notion; only the consent window is platform-specific. */
export interface NotionHost {
  readonly api: NotionApi;
  /** The URL consent returned to, or null if unfinished; `start` runs after any click-bound prompt. */
  authorize(start: (returnUri: string) => Promise<string>): Promise<string | null>;
  /** Makes a pending authorize() answer null; omitted where the consent window reports its own close. */
  cancel?(): void;
}
