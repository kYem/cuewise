import { describe, expect, it } from 'vitest';
import { NoopScheduler } from './noop-scheduler';

describe('NoopScheduler', () => {
  it('resolves scheduleAt/cancel and returns a callable unsubscribe', async () => {
    const scheduler = new NoopScheduler();

    await expect(scheduler.scheduleAt('id', new Date())).resolves.toBeUndefined();
    await expect(scheduler.cancel('id')).resolves.toBeUndefined();
    expect(() => scheduler.onFire(() => {})()).not.toThrow();
  });
});
