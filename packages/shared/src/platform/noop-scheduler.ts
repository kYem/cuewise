import type { SchedulerHost } from './types';

/**
 * Scheduler for hosts with no native wake source (dev/web/e2e): every operation no-ops, so the
 * reminder store falls back to its in-page poll.
 */
export class NoopScheduler implements SchedulerHost {
  readonly deliversInBackground = false;
  readonly persistsAcrossRestarts = false;

  async scheduleAt(_id: string, _when: Date): Promise<void> {}

  async cancel(_id: string): Promise<void> {}

  onFire(_handler: (id: string) => void | Promise<void>): () => void {
    return () => {};
  }
}
