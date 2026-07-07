import type { Scheduler } from '@cuewise/shared';

/**
 * Scheduler backed by chrome.alarms. Prefix-agnostic — callers own the alarm id
 * (e.g. `reminder-<id>`), so the same wrapper serves any feature.
 */
export class ChromeScheduler implements Scheduler {
  async scheduleAt(id: string, when: Date): Promise<void> {
    if (!chrome?.alarms) {
      return;
    }
    await chrome.alarms.create(id, { when: when.getTime() });
  }

  async cancel(id: string): Promise<void> {
    if (!chrome?.alarms) {
      return;
    }
    await chrome.alarms.clear(id);
  }

  onFire(handler: (id: string) => void | Promise<void>): () => void {
    const listener = (alarm: chrome.alarms.Alarm) => {
      void handler(alarm.name);
    };
    chrome.alarms.onAlarm.addListener(listener);
    return () => {
      chrome.alarms.onAlarm.removeListener(listener);
    };
  }
}
