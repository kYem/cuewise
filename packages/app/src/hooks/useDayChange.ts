import { getTodayDateString, logger } from '@cuewise/shared';
import { useEffect, useRef } from 'react';

/**
 * Fires the callback when the local calendar day changes while the app is open.
 * Checks once a minute and on tab foregrounding — background tabs throttle
 * intervals (and sleep suspends them entirely), so visibilitychange covers the
 * woke-up-tomorrow case promptly.
 */
export function useDayChange(onDayChange: () => void | Promise<void>): void {
  const callbackRef = useRef(onDayChange);
  callbackRef.current = onDayChange;

  useEffect(() => {
    let day = getTodayDateString();
    const check = () => {
      const next = getTodayDateString();
      if (next !== day) {
        day = next;
        // The marker already advanced, so a failing callback won't retry until
        // the next day change — this log is the only app-level record of it.
        Promise.resolve()
          .then(() => callbackRef.current())
          .catch((error) => {
            logger.error('Day-change callback failed', error);
          });
      }
    };

    const interval = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
}
