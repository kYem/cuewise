import { CLOCK_SKEW_TOLERANCE_MS, logger, weatherAgeMs } from '@cuewise/shared';
import { useEffect, useRef } from 'react';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Fires the callback once a reading has aged past `staleMs`, or is stamped so far ahead that the
 * clock must have stepped back. Checks on an interval and on tab foregrounding — a backgrounded
 * tab throttles intervals and sleep suspends them — and skips a hidden tab, since refreshing what
 * nobody is looking at spends quota for nothing. Retries at most once per `staleMs`, because a
 * callback that fails leaves the reading stale and so leaves the trigger armed.
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
  const lastAttemptRef = useRef(0);

  useEffect(() => {
    if (lastFetch === null) {
      return;
    }
    if (Number.isNaN(Date.parse(lastFetch))) {
      // An unparseable stamp never resolves, unlike a future one, so standing down beats
      // refreshing once a window forever. Reaching here is a caller's bug.
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
      const readingIsFresh = age !== null && age <= staleMs;
      // A step back strands the attempt clock ahead of now, so it gets the reading's tolerance:
      // without it every sub-minute correction reopens a window that should stay shut.
      const sinceAttempt = now - lastAttemptRef.current;
      const retriedRecently = sinceAttempt >= -CLOCK_SKEW_TOLERANCE_MS && sinceAttempt <= staleMs;
      if (readingIsFresh || retriedRecently) {
        return;
      }
      lastAttemptRef.current = now;
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
