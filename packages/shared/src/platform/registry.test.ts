import { beforeEach, describe, expect, it } from 'vitest';
import { configurePlatform, getNotifier, getScheduler, resetPlatform } from './registry';
import type { Notifier, Scheduler } from './types';

const fakeScheduler: Scheduler = {
  scheduleAt: async () => {},
  cancel: async () => {},
};
const fakeNotifier: Notifier = {
  notify: async () => {},
  clear: async () => {},
};

describe('platform registry', () => {
  beforeEach(() => {
    resetPlatform();
  });

  it('throws when the scheduler is not configured', () => {
    expect(() => getScheduler()).toThrow(/scheduler/i);
  });

  it('throws when the notifier is not configured', () => {
    expect(() => getNotifier()).toThrow(/notifier/i);
  });

  it('returns the configured scheduler', () => {
    configurePlatform({ scheduler: fakeScheduler });
    expect(getScheduler()).toBe(fakeScheduler);
  });

  it('returns the configured notifier', () => {
    configurePlatform({ notifier: fakeNotifier });
    expect(getNotifier()).toBe(fakeNotifier);
  });

  it('merges partial configuration without clearing the other binding', () => {
    configurePlatform({ scheduler: fakeScheduler });
    configurePlatform({ notifier: fakeNotifier });

    expect(getScheduler()).toBe(fakeScheduler);
    expect(getNotifier()).toBe(fakeNotifier);
  });
});
