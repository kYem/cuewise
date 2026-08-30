import { logger, weatherAgeMs } from '@cuewise/shared';
import { useEffect, useRef } from 'react';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Fires the callback once a reading has aged past `staleMs`, or is stamped so far ahead that the
 * clock must have stepped back. Checks on an interval and on tab foregrounding — a backgrounded
 * tab throttles intervals and sleep suspends them — and skips a hidden tab, since refreshing what
 * nobody is looking at spends quota for nothing.
 *
 * Retries at most once per `staleMs` measured from its own last attempt, because a callback that
 * fails leaves the reading stale and so leaves the trigger armed.
 *
 * @param lastFetch - ISO timestamp of the reading, or null to stand down.
 */
export function useStaleRefresh(
  lastFetch: string | null,
  staleMs: number,
  onStale: () => void | Promise<void>
): void {
  const callbackRef = useRef(onStale);
  callbackRef.current = onStale;
  // Monotonic, unlike the reading's stamp: elapsed time between attempts is the one thing a
  // clock correction must not be able to rewrite, in either direction.
  const lastAttemptRef = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    if (lastFetch === null) {
      return;
    }
    if (Number.isNaN(Date.parse(lastFetch))) {
      // An unparseable stamp never resolves, unlike a future one, so standing down beats
      // refreshing once a window forever.
      logger.error('Stale refresh stood down: unparseable timestamp', { lastFetch });
      return;
    }
    let loggedStep = false;
    const check = () => {
      if (document.hidden) {
        return;
      }
      const now = Date.now();
      // Null can only be a future stamp here; the unparseable case stood down above.
      const age = weatherAgeMs(lastFetch, new Date(now));
      if (age === null && !loggedStep) {
        loggedStep = true;
        logger.error('Weather reading is stamped ahead of now; the clock stepped back', {
          lastFetch,
          now: new Date(now).toISOString(),
        });
      }
      const readingIsFresh = age !== null && age <= staleMs;
      const retriedRecently = performance.now() - lastAttemptRef.current <= staleMs;
      if (readingIsFresh || retriedRecently) {
        return;
      }
      lastAttemptRef.current = performance.now();
      Promise.resolve()
        .then(() => callbackRef.current())
        .catch((error) => {
          logger.error('Stale-refresh callback failed', error);
        });
    };

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, [lastFetch, staleMs]);
}
