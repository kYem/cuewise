import { logger, weatherAgeMs } from '@cuewise/shared';
import { useEffect, useRef } from 'react';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Fires the callback once a reading has aged past `staleMs`, or is stamped so far ahead that the
 * clock must have stepped back. Checks on an interval and on tab foregrounding, because a
 * backgrounded tab throttles intervals and sleep suspends them, and skips a hidden tab. Retries
 * at most once per `staleMs` measured from its own last attempt.
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
  // Both clocks, because neither alone measures elapsed time: a sentinel of 0 would read as
  // "attempted at page load", so the window starts spent.
  const lastAttemptRef = useRef({
    mono: Number.NEGATIVE_INFINITY,
    wall: Number.NEGATIVE_INFINITY,
  });
  const loggedStepRef = useRef<string | null>(null);

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
    const check = () => {
      if (document.hidden) {
        return;
      }
      const now = Date.now();
      // Null can only be a future stamp here; the unparseable case stood down above.
      const age = weatherAgeMs(lastFetch, new Date(now));
      if (age === null && loggedStepRef.current !== lastFetch) {
        loggedStepRef.current = lastFetch;
        logger.error('Weather reading is stamped ahead of now; the clock stepped back', {
          lastFetch,
          now: new Date(now).toISOString(),
        });
      }
      const readingIsFresh = age !== null && age <= staleMs;
      // Sleep freezes the monotonic clock while wall time runs on; a step back does the reverse.
      // Only when both call the window unspent is it really unspent.
      const monoGap = performance.now() - lastAttemptRef.current.mono;
      const wallGap = now - lastAttemptRef.current.wall;
      const retriedRecently = monoGap <= staleMs && wallGap <= staleMs;
      if (readingIsFresh || retriedRecently) {
        return;
      }
      lastAttemptRef.current = { mono: performance.now(), wall: now };
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
