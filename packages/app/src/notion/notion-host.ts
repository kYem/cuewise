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
  /**
   * Runs Notion's consent and answers the URL it returned to, or null when the flow did not finish
   * (the host logs why). `start` runs after anything the user's click is needed for, such as a
   * permission prompt, and builds the consent URL for the host's return URI.
   */
  authorize(start: (returnUri: string) => Promise<string>): Promise<string | null>;
}
