import { configurePlatform, type KeyValueStore } from '@cuewise/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { startMock } = vi.hoisted(() => ({ startMock: vi.fn(() => Promise.resolve()) }));

vi.mock('@cuewise/storage', () => ({
  getReminders: vi.fn(() => Promise.resolve([])),
  setReminders: vi.fn(() => Promise.resolve({ success: true })),
  ensureSettingsMigrated: vi.fn(() => Promise.reject(new Error('storage unavailable'))),
}));

vi.mock('@cuewise/sync-engine', () => ({
  createSyncEngine: vi.fn(() => ({ start: startMock, handlePullWake: vi.fn() })),
}));

const chromeMock = {
  alarms: {
    create: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve(true)),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  notifications: {
    create: vi.fn(() => Promise.resolve('id')),
    clear: vi.fn(() => Promise.resolve(true)),
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
    onButtonClicked: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  storage: {
    local: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
    },
  },
  runtime: {
    getURL: (path: string) => path,
    getManifest: vi.fn().mockReturnValue({ version: '9.9.9' }),
    setUninstallURL: vi.fn().mockResolvedValue(undefined),
    onMessage: { addListener: vi.fn() },
  },
};

// Typed, not cast through unknown: a cast hides a missing method from tsc, and any caller that
// reached it would get a TypeError where the port contracts a value.
const noopStore: KeyValueStore = {
  supportsSync: true,
  get: async () => null,
  set: async () => ({ success: true }),
  remove: async () => true,
  getMany: async () => ({}),
  keys: async () => [],
  setMany: async () => ({ success: true }),
  removeMany: async () => true,
  getUsage: async () => ({ bytesInUse: 0, quota: 0 }),
};

beforeAll(async () => {
  global.chrome = chromeMock as unknown as typeof chrome;
  configurePlatform({ storage: noopStore });
  vi.stubEnv('VITE_SYNC_API_BASE_URL', 'https://sync.example.test');
  await import('./background');
}, 30_000);

afterAll(() => {
  vi.unstubAllEnvs();
});

// A settled migration delays the first storage touch; a rejected one would cancel it for the
// worker's whole lifetime, leaving the device silently unsynced until the next cold start.
describe('background: a settings migration that fails', () => {
  it('still starts the sync engine', async () => {
    await vi.waitFor(() => expect(startMock).toHaveBeenCalled());
  });
});
