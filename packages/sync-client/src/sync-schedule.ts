import type { Scheduler } from '@cuewise/shared';

export const SYNC_PULL_WAKE_ID = 'sync:pull';

/**
 * Arms the next sync-pull wake `delayMinutes` from now.
 * Integration contract for the follow-up host wiring: this does not reschedule
 * itself, so the host's onFire handler must call armSyncPull again to keep polling.
 */
export async function armSyncPull(
  scheduler: Scheduler,
  delayMinutes: number,
  now: () => number = Date.now
): Promise<void> {
  await scheduler.scheduleAt(SYNC_PULL_WAKE_ID, new Date(now() + delayMinutes * 60_000));
}
