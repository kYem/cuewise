import { logger } from '@cuewise/shared';
import { useEffect, useRef } from 'react';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Fires the callback once a reading has aged past `staleMs`, checking on an interval and on
 * tab foregrounding — a backgrounded tab throttles intervals and sleep suspends them.
 *
 * Skips a hidden tab: refreshing what nobody is looking at spends quota for nothing. Retries
 * at most once per `staleMs` measured from its own last attempt, since a callback that fails
 * leaves the reading stale and so leaves the trigger armed.
 *
 * @param lastFetch - ISO timestamp of the reading, or null to stand down: nothing fetched
 * yet, or the caller is switched off.
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
    const taken = Date.parse(lastFetch);
    if (Number.isNaN(taken)) {
      // Standing down beats refreshing once a window forever on a reading we cannot date,
      // but reaching here means a caller passed a timestamp it never validated.
      logger.warn('Stale refresh stood down: unparseable timestamp', { lastFetch });
      return;
    }
    const check = () => {
      if (document.hidden) {
        return;
      }
      const now = Date.now();
      if (now - taken <= staleMs || now - lastAttemptRef.current <= staleMs) {
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
