import type { NotionHost } from '@cuewise/app';
import { describeThrown, getStorage, logger } from '@cuewise/shared';
import { ApiClient, SessionManager } from '@cuewise/sync-client';

/**
 * The page realm's own client, over the session the worker's sync engine keeps in storage. It never
 * clears that session: a 401 here is shown, and the engine finds its own auth loss next cycle.
 */
export function createChromeNotionHost(baseUrl: string): NotionHost {
  const api = new ApiClient({
    baseUrl,
    getToken: () => new SessionManager(getStorage()).getToken(),
  });
  return {
    api,
    async authorize(start) {
      // Asked before any network wait, which would outlast the click's user activation.
      let granted: boolean;
      try {
        granted = await chrome.permissions.request({ permissions: ['identity'] });
      } catch (error) {
        logger.warn(
          `Failed to request the identity permission for Notion: ${describeThrown(error)}`,
          {
            error,
          }
        );
        return null;
      }
      if (!granted) {
        logger.warn('Notion connect aborted: the identity permission was denied');
        return null;
      }
      const url = await start(chrome.identity.getRedirectURL('notion'));
      try {
        const redirect = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
        return redirect ?? null;
      } catch (error) {
        // Chromium reports any window close this way, a Notion-side error page included.
        logger.warn(`Notion consent window was closed or failed: ${describeThrown(error)}`, {
          error,
        });
        return null;
      }
    },
  };
}
