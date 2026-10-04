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

/**
 * Whether this page's first grant found the lock free. Kept per page because a StrictMode remount
 * queues behind its own first mount, and must not mistake that wait for another tab's audio.
 */
let firstGrantWasFree: boolean | null = null;

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

    const lead = async (fresh: boolean) => {
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
    };

    const requestLeadership = async () => {
      logger.debug('Requesting sounds leadership lock...');

      if (navigator.locks === undefined) {
        logger.warn('Using fallback (no Web Locks) - assuming leader');
        setIsLeader(true, { fresh: true });
        return;
      }

      try {
        // Free right now means no tab was holding the audio; a wait means another tab held or
        // claimed it first, and hands over.
        const grantedAtOnce = await navigator.locks.request(
          LOCK_NAME,
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              return false;
            }
            firstGrantWasFree ??= true;
            if (!aborted) {
              await lead(firstGrantWasFree);
            }
            return true;
          }
        );
        if (grantedAtOnce || aborted) {
          return;
        }

        await navigator.locks.request(LOCK_NAME, async (lock) => {
          if (!lock || aborted) {
            logger.debug('Lock not acquired or aborted');
            return;
          }
          firstGrantWasFree ??= false;
          await lead(firstGrantWasFree);
        });
      } catch (error) {
        logger.error('Error requesting sounds leadership', error);
        // The lock is gone with the throw, so this tab must stop claiming the audio too.
        if (lockHeldRef.current) {
          lockHeldRef.current = false;
          setIsLeader(false);
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
