import type { NotionHost } from '@cuewise/app';
import { type KeyValueStore, logger } from '@cuewise/shared';
import { ApiClient, SessionManager } from '@cuewise/sync-client';
import { OAuthCancelledError, type OAuthDriver } from '../platform/oauth-driver';

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
export function createTauriNotionHost(
  opts: CreateTauriNotionHostOptions
): NotionHost & { cancel(): void } {
  const session = new SessionManager(opts.keyStore);
  const api = new ApiClient({
    baseUrl: opts.baseUrl,
    getToken: () => session.getToken(),
    fetchFn: opts.fetchFn,
  });
  // Latched, since a cancel during start()'s fetch has no pending driver flow to reject yet.
  let cancelled = false;
  return {
    api,
    // A browser that never opened or a callback that never came throws, so the store reports it.
    async authorize(start) {
      cancelled = false;
      const url = await start(NOTION_RETURN_URI);
      if (cancelled) {
        logger.info('Notion connect cancelled from the app');
        return null;
      }
      try {
        return await opts.oauthDriver.authorize(url);
      } catch (error) {
        if (error instanceof OAuthCancelledError) {
          logger.info('Notion connect cancelled from the app');
          return null;
        }
        throw error;
      }
    },
    cancel() {
      cancelled = true;
      opts.oauthDriver.cancel();
    },
  };
}
