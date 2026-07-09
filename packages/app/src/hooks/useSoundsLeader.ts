import { createLogger, LogLevel } from '@cuewise/shared';
import { useEffect, useRef } from 'react';
import { useSoundsStore } from '../stores/sounds-store';

const logger = createLogger({
  prefix: '[SoundsLeader]',
  minLevel: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN,
  includeTimestamp: false,
});

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
        await navigator.locks.request('cuewise-sounds-leader', async (lock) => {
          if (!lock || aborted) {
            logger.debug('Lock not acquired or aborted');
            return;
          }

          logger.debug('Sounds lock acquired! This tab is the sounds leader');
          lockHeldRef.current = true;
          setIsLeader(true);

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
          setIsLeader(true);
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
