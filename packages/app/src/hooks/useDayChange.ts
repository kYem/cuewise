import { getTodayDateString, logger } from '@cuewise/shared';
import { useEffect, useRef } from 'react';

/**
 * Fires the callback when the local calendar day changes while the app is open.
 * Checks once a minute and on tab foregrounding — intervals don't tick while a
 * tab is backgrounded or the machine sleeps, so visibilitychange covers the
 * woke-up-tomorrow case.
 */
export function useDayChange(onDayChange: () => void): void {
  const callbackRef = useRef(onDayChange);
  callbackRef.current = onDayChange;

  useEffect(() => {
    let day = getTodayDateString();
    const check = () => {
      const next = getTodayDateString();
      if (next !== day) {
        day = next;
        try {
          callbackRef.current();
        } catch (error) {
          // The day marker already advanced — swallowing keeps a bad callback
          // from escaping into the interval/event handler unlogged.
          logger.error('Day-change callback failed', error);
        }
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
