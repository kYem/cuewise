import type { Scheduler } from '@cuewise/shared';

/** Recording Scheduler fake for engine tests; scheduleAt/cancel are captured, nothing fires. */
export class FakeScheduler implements Scheduler {
  readonly deliversInBackground = false;
  readonly persistsAcrossRestarts = false;
  readonly scheduled: Array<{ id: string; when: Date }> = [];
  readonly cancelled: string[] = [];

  async scheduleAt(id: string, when: Date): Promise<void> {
    this.scheduled.push({ id, when });
  }

  async cancel(id: string): Promise<void> {
    this.cancelled.push(id);
  }
}
