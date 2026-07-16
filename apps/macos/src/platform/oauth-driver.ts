import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { open } from '@tauri-apps/plugin-shell';

/** Runs one system-browser OAuth round-trip; the seam DirectSyncController tests fake. */
export interface OAuthDriver {
  /**
   * Opens startUrl in the system browser and resolves with the first cuewise://auth
   * callback URL delivered to the app. Rejects on timeout or if the browser can't open.
   */
  authorize(startUrl: string): Promise<string>;
}

// Only the auth callback path counts; stray deep links to other cuewise:// paths are ignored.
const CALLBACK_PREFIX = 'cuewise://auth';
// Generous: the user may be picking an account / typing a password in the browser.
const CALLBACK_TIMEOUT_MS = 300_000;

/**
 * Production driver over the Tauri shell + deep-link plugins. The one-shot listener only
 * exists while a flow is pending, so a stale cuewise://auth arriving outside a flow is
 * dropped on the floor — and the PKCE verifier for it died with that flow anyway.
 */
export function createTauriOAuthDriver(): OAuthDriver {
  return {
    authorize(startUrl: string): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        let settled = false;
        let unlisten: (() => void) | null = null;

        function settle(complete: () => void): void {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (unlisten !== null) {
            unlisten();
            unlisten = null;
          }
          complete();
        }

        const timer = setTimeout(() => {
          settle(() => reject(new Error('Timed out waiting for the sign-in callback')));
        }, CALLBACK_TIMEOUT_MS);

        onOpenUrl((urls) => {
          const callback = urls.find((url) => url.startsWith(CALLBACK_PREFIX));
          if (callback !== undefined) {
            settle(() => resolve(callback));
          }
        })
          .then((stop) => {
            if (settled) {
              // The flow already ended (timeout / open failure) — don't leak the subscription.
              stop();
              return;
            }
            unlisten = stop;
          })
          .catch((err) => {
            settle(() => reject(err instanceof Error ? err : new Error(String(err))));
          });

        open(startUrl).catch((err) => {
          settle(() => reject(err instanceof Error ? err : new Error(String(err))));
        });
      });
    },
  };
}
