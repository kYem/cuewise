import { createLogger, LogLevel } from '@cuewise/shared';
import { useEffect, useRef } from 'react';
import { useSoundsStore } from '../stores/sounds-store';

const logger = createLogger({
  prefix: '[SoundsLeader]',
  // Private instance — the global configureLogger() the test setup silences
  // doesn't reach it, so gate it off under vitest directly.
  enabled: !import.meta.env.TEST,
  minLevel: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN,
  includeTimestamp: false,
});

const LOCK_NAME = 'cuewise-sounds-leader';

let heldAtFirstAsk: Promise<boolean> | null = null;

/**
 * Asked once per page, before this page queues for the lock: a StrictMode remount would otherwise
 * find the lock held by its own first mount and mistake that for another tab's audio.
 */
function anotherTabHeldTheAudio(): Promise<boolean> {
  heldAtFirstAsk ??= navigator.locks
    .query()
    .then((snapshot) => (snapshot.held ?? []).some((lock) => lock.name === LOCK_NAME))
    // A failed probe must not reject the lock callback, or the fallback would claim leadership.
    .catch(() => false);
  return heldAtFirstAsk;
}

/**
 * Hook to handle sounds playback leader election
 * Only one tab across the browser will play sounds (YouTube)
 * Uses Web Locks API for automatic leader election
 *
 * Sets isLeader in the sounds store, which controls whether
 * this tab actually plays audio or just shows the UI state.
 */
export function useSoundsLeader(): void {
  const setIsLeader = useSoundsStore((state) => state.setIsLeader);
  const lockHeldRef = useRef(false);

  useEffect(() => {
    let aborted = false;

    const requestLeadership = async () => {
      logger.debug('Requesting sounds leadership lock...');

      try {
        const heldElsewhere = anotherTabHeldTheAudio();
        await navigator.locks.request(LOCK_NAME, async (lock) => {
          if (!lock || aborted) {
            logger.debug('Lock not acquired or aborted');
            return;
          }

          const fresh = !(await heldElsewhere);
          logger.debug('Sounds lock acquired! This tab is the sounds leader', { fresh });
          lockHeldRef.current = true;
          setIsLeader(true, { fresh });

          // Hold the lock until component unmounts
          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (aborted) {
                logger.debug('Releasing sounds lock (component unmounted)');
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
          });

          lockHeldRef.current = false;
          setIsLeader(false);
        });
      } catch (error) {
        logger.error('Error requesting sounds leadership', error);
        // Fallback: assume leader if Web Locks not supported
        if (!aborted) {
          logger.warn('Using fallback (no Web Locks) - assuming leader');
          setIsLeader(true, { fresh: true });
        }
      }
    };

    requestLeadership();

    return () => {
      logger.debug('Sounds leader hook cleanup');
      aborted = true;
      setIsLeader(false);
    };
  }, [setIsLeader]);
}
