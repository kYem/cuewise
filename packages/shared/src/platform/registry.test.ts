import { beforeEach, describe, expect, it } from 'vitest';
import {
  configurePlatform,
  getNotifier,
  getScheduler,
  getStorage,
  resetPlatform,
} from './registry';
import type { KeyValueStore, Notifier, Scheduler } from './types';

const fakeScheduler: Scheduler = {
  deliversInBackground: false,
  persistsAcrossRestarts: false,
  scheduleAt: async () => {},
  cancel: async () => {},
};
const fakeNotifier: Notifier = {
  notify: async () => {},
  clear: async () => {},
};
const fakeStorage: KeyValueStore = {
  get: async () => null,
  set: async () => ({ success: true }),
  remove: async () => true,
  getUsage: async () => ({ bytesInUse: 0, quota: 0 }),
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

  it('throws when the storage is not configured', () => {
    expect(() => getStorage()).toThrow(/storage/i);
  });

  it('returns the configured scheduler', () => {
    configurePlatform({ scheduler: fakeScheduler });
    expect(getScheduler()).toBe(fakeScheduler);
  });

  it('returns the configured notifier', () => {
    configurePlatform({ notifier: fakeNotifier });
    expect(getNotifier()).toBe(fakeNotifier);
  });

  it('returns the configured storage', () => {
    configurePlatform({ storage: fakeStorage });
    expect(getStorage()).toBe(fakeStorage);
  });

  it('merges partial configuration without clearing the other bindings', () => {
    configurePlatform({ scheduler: fakeScheduler });
    configurePlatform({ notifier: fakeNotifier });
    configurePlatform({ storage: fakeStorage });

    expect(getScheduler()).toBe(fakeScheduler);
    expect(getNotifier()).toBe(fakeNotifier);
    expect(getStorage()).toBe(fakeStorage);
  });
});
