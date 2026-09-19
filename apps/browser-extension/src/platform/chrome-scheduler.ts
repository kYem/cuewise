import { logger, type SchedulerHost } from '@cuewise/shared';

/**
 * Scheduler backed by chrome.alarms. Prefix-agnostic — callers own the alarm id
 * (e.g. `reminder-<id>`), so the same wrapper serves any feature.
 */
export class ChromeScheduler implements SchedulerHost {
  readonly deliversInBackground = true;
  // True only because the service worker itself re-arms from storage on install, update and
  // browser start (background.ts) — Chrome clears alarms on every update. The page must not
  // also re-arm: it cannot see what is armed, so it would re-create an alarm mid-fire.
  readonly persistsAcrossRestarts = true;

  async scheduleAt(id: string, when: Date): Promise<void> {
    await chrome.alarms.create(id, { when: when.getTime() });
  }

  async cancel(id: string): Promise<void> {
    await chrome.alarms.clear(id);
  }

  onFire(handler: (id: string) => void | Promise<void>): () => void {
    const listener = async (alarm: chrome.alarms.Alarm) => {
      try {
        await handler(alarm.name);
      } catch (error) {
        logger.error('Scheduler onFire handler failed', error);
      }
    };
    chrome.alarms.onAlarm.addListener(listener);
    return () => {
      chrome.alarms.onAlarm.removeListener(listener);
    };
  }
}
