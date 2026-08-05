import { logger } from '@cuewise/shared';

// Alt-tabbing is cheap for the user and a request for us; one sync per window activation at most.
const FOCUS_SYNC_THROTTLE_MS = 30_000;

type FocusSubscribe = (cb: () => void) => Promise<() => void> | (() => void);

interface FocusSyncDeps {
  onFocus?: FocusSubscribe;
  now?: () => number;
}

/**
 * The long-running window otherwise only pulls at launch and then every five minutes, so a
 * change made elsewhere can sit unseen while the user is looking straight at it.
 */
export function startFocusSync(
  controller: { syncNow: () => Promise<unknown> },
  deps: FocusSyncDeps = {}
): () => void {
  const now = deps.now ?? Date.now;
  const subscribe = deps.onFocus ?? defaultFocusSource;
  let lastRun = Number.NEGATIVE_INFINITY;

  const handler = (): void => {
    if (now() - lastRun < FOCUS_SYNC_THROTTLE_MS) {
      return;
    }
    lastRun = now();
    controller.syncNow().catch((error) => {
      logger.warn('Focus sync failed; the scheduled wake will retry', { error });
    });
  };

  const result = subscribe(handler);
  if (result instanceof Promise) {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    result
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unsub = fn;
      })
      .catch((error) => logger.warn('Could not subscribe to window focus', { error }));
    return () => {
      cancelled = true;
      unsub?.();
    };
  }
  return result;
}

function defaultFocusSource(cb: () => void): Promise<() => void> {
  return import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        cb();
      }
    })
  );
}
