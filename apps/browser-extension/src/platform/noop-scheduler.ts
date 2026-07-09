import type { SchedulerHost } from '@cuewise/shared';

/** Scheduler for contexts without chrome.alarms (dev/web): every operation no-ops. */
export class NoopScheduler implements SchedulerHost {
  readonly deliversInBackground = false;
  readonly persistsAcrossRestarts = false;

  async scheduleAt(_id: string, _when: Date): Promise<void> {}

  async cancel(_id: string): Promise<void> {}

  onFire(_handler: (id: string) => void | Promise<void>): () => void {
    return () => {};
  }
}
