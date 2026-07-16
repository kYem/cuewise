import { logger } from '@cuewise/shared';
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

function toError(err: unknown): Error {
  if (err instanceof Error) {
    return err;
  }
  return new Error(String(err));
}

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

        // complete() must be unreachable-proof: settled latches first, and a throwing
        // unlisten() must never leave the promise (and the controller mutex) hanging.
        function settle(complete: () => void): void {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (unlisten !== null) {
            try {
              unlisten();
            } catch (err) {
              logger.warn(`Deep-link unlisten failed during OAuth settle: ${toError(err).message}`);
            }
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
              try {
                stop();
              } catch (err) {
                logger.warn(
                  `Deep-link unlisten failed after the flow settled: ${toError(err).message}`
                );
              }
              return;
            }
            unlisten = stop;
          })
          .catch((err) => {
            if (settled) {
              // The true reason the callback never arrived — say so instead of vanishing.
              logger.warn(
                `Deep-link listener registration failed after the flow settled: ${toError(err).message}`
              );
              return;
            }
            settle(() => reject(toError(err)));
          });

        open(startUrl).catch((err) => {
          if (settled) {
            logger.warn(
              `Browser open failed after the OAuth flow settled: ${toError(err).message}`
            );
            return;
          }
          settle(() => reject(toError(err)));
        });
      });
    },
  };
}
