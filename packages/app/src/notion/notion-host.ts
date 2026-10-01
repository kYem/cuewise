import type { NotionConnection, NotionTables } from '@cuewise/shared';

/** The Notion routes of the sync API client, declared structurally so this package stays off it. */
export interface NotionApi {
  getNotionConnection(): Promise<NotionConnection | null>;
  startNotion(returnUri: string, codeChallenge: string): Promise<string>;
  claimNotion(code: string, codeVerifier: string): Promise<void>;
  listNotionTables(): Promise<NotionTables>;
  selectNotionTable(dataSourceId: string, name: string): Promise<void>;
  disconnectNotion(): Promise<void>;
}

/** What a host supplies to connect Notion; only the consent window is platform-specific. */
export interface NotionHost {
  readonly api: NotionApi;
  /** The URL Notion's consent returned to, or null if it did not finish (the host logs why). */
  // `start` builds the consent URL; hosts call it only after any prompt the click must reach.
  authorize(start: (returnUri: string) => Promise<string>): Promise<string | null>;
}
