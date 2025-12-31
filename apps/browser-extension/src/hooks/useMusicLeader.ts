import { createLogger, LogLevel } from '@cuewise/shared';
import { useEffect, useRef } from 'react';
import { useMusicStore } from '../stores/music-store';

const logger = createLogger({
  prefix: '[MusicLeader]',
  minLevel: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN,
  includeTimestamp: false,
});

/**
 * Hook to handle music playback leader election
 * Only one tab across the browser will play music
 * Uses Web Locks API for automatic leader election
 *
 * Sets isLeader in the music store, which controls whether
 * this tab actually plays audio or just shows the UI state.
 */
export function useMusicLeader(): void {
  const setIsLeader = useMusicStore((state) => state.setIsLeader);
  const lockHeldRef = useRef(false);

  useEffect(() => {
    let aborted = false;

    const requestLeadership = async () => {
      logger.debug('Requesting music leadership lock...');

      try {
        await navigator.locks.request('cuewise-music-leader', async (lock) => {
          if (!lock || aborted) {
            logger.debug('Lock not acquired or aborted');
            return;
          }

          logger.debug('Music lock acquired! This tab is the music leader');
          lockHeldRef.current = true;
          setIsLeader(true);

          // Hold the lock until component unmounts
          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (aborted) {
                logger.debug('Releasing music lock (component unmounted)');
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
          });

          lockHeldRef.current = false;
          setIsLeader(false);
        });
      } catch (error) {
        logger.error('Error requesting music leadership', error);
        // Fallback: assume leader if Web Locks not supported
        if (!aborted) {
          logger.warn('Using fallback (no Web Locks) - assuming leader');
          setIsLeader(true);
        }
      }
    };

    requestLeadership();

    return () => {
      logger.debug('Music leader hook cleanup');
      aborted = true;
      setIsLeader(false);
    };
  }, [setIsLeader]);
}
