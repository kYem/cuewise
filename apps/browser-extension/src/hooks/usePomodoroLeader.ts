import { createLogger, LogLevel } from '@cuewise/shared';
import { useEffect, useRef } from 'react';
import { usePomodoroStore } from '../stores/pomodoro-store';

const logger = createLogger({
  prefix: '[PomodoroLeader]',
  minLevel: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN,
  includeTimestamp: false,
});

/**
 * Hook to handle Pomodoro timer ticking with leader election
 * Only one tab/component across the entire browser will run the timer
 * Uses Web Locks API for automatic leader election and failover
 */
export function usePomodoroLeader() {
  const status = usePomodoroStore((state) => state.status);
  const tick = usePomodoroStore((state) => state.tick);
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (status !== 'running') {
      logger.debug('Timer not running, skipping leader election');
      return;
    }

    // Prevent multiple simultaneous lock requests
    if (isRunningRef.current) {
      logger.debug('Already running, skipping');
      return;
    }

    isRunningRef.current = true;

    // Use Web Locks API for leader election
    const requestLeadership = async () => {
      logger.debug('Requesting leadership lock...');
      let intervalId: number | null = null;

      try {
        await navigator.locks.request('pomodoro-timer-leader', async (lock) => {
          if (!lock) {
            logger.debug('Lock not acquired');
            return;
          }

          // Double-check status is still running when we acquire the lock
          if (usePomodoroStore.getState().status !== 'running') {
            logger.debug('Timer stopped before lock acquired');
            return;
          }

          // Check if still supposed to be running (effect might have re-run)
          if (!isRunningRef.current) {
            logger.debug('Effect already cleaned up, not starting interval');
            return;
          }

          logger.debug('Lock acquired! Starting timer interval');
          // This tab is the leader - run the timer
          intervalId = setInterval(() => {
            const currentStatus = usePomodoroStore.getState().status;
            if (currentStatus === 'running') {
              tick();
            }
          }, 1000);

          // Hold the lock until timer stops or ref is cleared
          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              const currentStatus = usePomodoroStore.getState().status;
              if (!isRunningRef.current || currentStatus !== 'running') {
                logger.debug('Releasing lock', {
                  running: isRunningRef.current,
                  status: currentStatus,
                });
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
          });

          // Clean up interval when releasing lock
          if (intervalId) {
            logger.debug('Cleaning up interval');
            clearInterval(intervalId);
            intervalId = null;
          }
        });
      } catch (error) {
        logger.error('Error requesting timer leadership', error);
        // Fallback: run timer anyway if Web Locks not supported
        if (isRunningRef.current) {
          logger.warn('Using fallback interval (no Web Locks)');
          intervalId = setInterval(() => {
            if (usePomodoroStore.getState().status === 'running') {
              tick();
            }
          }, 1000);
        }
      } finally {
        isRunningRef.current = false;
        if (intervalId) {
          clearInterval(intervalId);
        }
      }
    };

    requestLeadership();

    // Don't abort the lock request - let it complete
    // Just mark that this effect is no longer active
    return () => {
      logger.debug('Effect cleanup, marking as not running');
      isRunningRef.current = false;
    };
  }, [status, tick]);
}
