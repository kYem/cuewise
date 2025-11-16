import { useEffect } from 'react';
import { usePomodoroStore } from '../stores/pomodoro-store';

/**
 * Hook to handle Pomodoro timer ticking with leader election
 * Only one tab/component across the entire browser will run the timer
 * Uses Web Locks API for automatic leader election and failover
 */
export function usePomodoroLeader() {
  const { status, tick } = usePomodoroStore();

  useEffect(() => {
    if (status !== 'running') return;

    let active = true;
    let intervalId: number | null = null;

    // Use Web Locks API for leader election
    const requestLeadership = async () => {
      try {
        await navigator.locks.request('pomodoro-timer-leader', async (lock) => {
          if (!active || !lock) return;

          // This tab is the leader - run the timer
          intervalId = setInterval(() => {
            if (usePomodoroStore.getState().status === 'running') {
              tick();
            }
          }, 1000);

          // Hold the lock until timer stops or component unmounts
          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (!active || usePomodoroStore.getState().status !== 'running') {
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
          });

          // Clean up interval when releasing lock
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        });
      } catch (error) {
        console.error('Error requesting timer leadership:', error);
        // Fallback: run timer anyway if Web Locks not supported
        if (active) {
          intervalId = setInterval(() => {
            tick();
          }, 1000);
        }
      }
    };

    requestLeadership();

    return () => {
      active = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [status, tick]);
}
