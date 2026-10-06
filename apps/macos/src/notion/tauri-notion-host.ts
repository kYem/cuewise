import type { NotionHost } from '@cuewise/app';
import { describeThrown, type KeyValueStore, logger } from '@cuewise/shared';
import { ApiClient, SessionManager } from '@cuewise/sync-client';
import type { OAuthDriver } from '../platform/oauth-driver';

/** Must exactly match an ALLOWED_RETURN_URIS entry on the server. */
export const NOTION_RETURN_URI = 'cuewise://notion';

export interface CreateTauriNotionHostOptions {
  baseUrl: string;
  /** The store the sync engine keeps its session in. */
  keyStore: KeyValueStore;
  /** Built with `NOTION_RETURN_URI` as its callback prefix. */
  oauthDriver: OAuthDriver;
  /** Native http-plugin fetch in Tauri: the production CSP and API CORS block webview fetch. */
  fetchFn?: typeof fetch;
}

/** Notion over the sync engine's session, never clearing it: the engine owns auth loss. */
export function createTauriNotionHost(opts: CreateTauriNotionHostOptions): NotionHost {
  const session = new SessionManager(opts.keyStore);
  const api = new ApiClient({
    baseUrl: opts.baseUrl,
    getToken: () => session.getToken(),
    fetchFn: opts.fetchFn,
  });
  return {
    api,
    async authorize(start) {
      const url = await start(NOTION_RETURN_URI);
      try {
        return await opts.oauthDriver.authorize(url);
      } catch (error) {
        logger.warn(`Notion consent did not return: ${describeThrown(error)}`, { error });
        return null;
      }
    },
  };
}
