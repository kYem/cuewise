import { logger, type SchedulerHost } from '@cuewise/shared';

/**
 * Scheduler backed by chrome.alarms. Prefix-agnostic — callers own the alarm id
 * (e.g. `reminder-<id>`), so the same wrapper serves any feature.
 */
export class ChromeScheduler implements SchedulerHost {
  async scheduleAt(id: string, when: Date): Promise<void> {
    await chrome.alarms.create(id, { when: when.getTime() });
  }

  async cancel(id: string): Promise<void> {
    await chrome.alarms.clear(id);
  }

  onFire(handler: (id: string) => void | Promise<void>): () => void {
    const listener = (alarm: chrome.alarms.Alarm) => {
      Promise.resolve(handler(alarm.name)).catch((error) => {
        logger.error('Scheduler onFire handler failed', error);
      });
    };
    chrome.alarms.onAlarm.addListener(listener);
    return () => {
      chrome.alarms.onAlarm.removeListener(listener);
    };
  }
}
