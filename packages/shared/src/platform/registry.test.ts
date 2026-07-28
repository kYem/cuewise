import { beforeEach, describe, expect, it } from 'vitest';
import {
  configurePlatform,
  getHttpFetch,
  getNotifier,
  getScheduler,
  getStorage,
  getSyncSink,
  resetPlatform,
} from './registry';
import type { HttpFetch, KeyValueStore, Notifier, Scheduler, SyncMutationSink } from './types';

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
  supportsSync: false,
  get: async () => null,
  set: async () => ({ success: true }),
  remove: async () => true,
  getMany: async () => ({}),
  keys: async () => [],
  setMany: async () => ({ success: true }),
  removeMany: async () => true,
  getUsage: async () => ({ bytesInUse: 0, quota: 0 }),
};
const fakeSyncSink: SyncMutationSink = {
  markMutated: async () => {},
  markDeleted: async () => {},
};
const fakeHttpFetch: HttpFetch = async () => new Response('{}');

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

  // Deliberately throws rather than falling back to globalThis.fetch: a silent default
  // would hide a missing macOS registration until a runtime CSP error.
  it('throws when the http fetch is not configured', () => {
    expect(() => getHttpFetch()).toThrow(/httpfetch/i);
  });

  it('returns the configured http fetch', () => {
    configurePlatform({ httpFetch: fakeHttpFetch });
    expect(getHttpFetch()).toBe(fakeHttpFetch);
  });

  it('returns null for the sync sink when not configured, unlike the other ports', () => {
    expect(getSyncSink()).toBeNull();
  });

  it('returns the configured sync sink', () => {
    configurePlatform({ syncSink: fakeSyncSink });
    expect(getSyncSink()).toBe(fakeSyncSink);
  });

  it('merges partial configuration without clearing the other bindings', () => {
    configurePlatform({ scheduler: fakeScheduler });
    configurePlatform({ notifier: fakeNotifier });
    configurePlatform({ storage: fakeStorage });
    configurePlatform({ httpFetch: fakeHttpFetch });
    configurePlatform({ syncSink: fakeSyncSink });

    expect(getScheduler()).toBe(fakeScheduler);
    expect(getNotifier()).toBe(fakeNotifier);
    expect(getStorage()).toBe(fakeStorage);
    expect(getHttpFetch()).toBe(fakeHttpFetch);
    expect(getSyncSink()).toBe(fakeSyncSink);
  });

  it('resetPlatform clears the http fetch', () => {
    configurePlatform({ httpFetch: fakeHttpFetch });

    resetPlatform();

    expect(() => getHttpFetch()).toThrow(/httpfetch/i);
  });

  it('explicitly clearing the sync sink with null does not disturb the other bindings', () => {
    configurePlatform({ scheduler: fakeScheduler, storage: fakeStorage, syncSink: fakeSyncSink });

    configurePlatform({ syncSink: null });

    expect(getSyncSink()).toBeNull();
    expect(getScheduler()).toBe(fakeScheduler);
    expect(getStorage()).toBe(fakeStorage);
  });

  it('omitting syncSink from configurePlatform leaves a previously configured sink untouched', () => {
    configurePlatform({ syncSink: fakeSyncSink });

    configurePlatform({ scheduler: fakeScheduler });

    expect(getSyncSink()).toBe(fakeSyncSink);
  });
});
