import { logger } from '@cuewise/shared';
import { useEffect, useRef } from 'react';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Fires the callback once a reading has aged past `staleMs`, while the app stays open —
 * mounting is otherwise the only thing that ever re-reads it. Checks on an interval and on
 * tab foregrounding, since a backgrounded tab throttles intervals and sleep suspends them.
 *
 * Skips a hidden tab: refreshing what nobody is looking at spends provider quota for
 * nothing. A failed attempt leaves the reading stale and so leaves the trigger armed, hence
 * one attempt per window rather than one per check.
 *
 * @param lastFetch - ISO timestamp of the reading, or null before the first has landed.
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
