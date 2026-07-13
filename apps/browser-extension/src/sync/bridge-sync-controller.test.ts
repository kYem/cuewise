import { logger } from '@cuewise/shared';
import { createChromeStorageMock, type MockChromeStorage } from '@cuewise/test-utils/mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeSyncController, LAST_SYNC_CREDS_KEY } from './bridge-sync-controller';
import type { SyncControlResponse } from './sync-control-messages';

const STATUS_KEY = 'cuewise.sync.status';
const QUARANTINE_KEY = 'cuewise.sync.lastQuarantineAt';
const CLOUD_SYNC_ENABLED_KEY = 'cloudSyncEnabled';

type StorageChangeMap = { [key: string]: chrome.storage.StorageChange };
type StorageChangeListener = (changes: StorageChangeMap, area: string) => void;

const runtime = {
  sendMessage: vi.fn(
    (_message: unknown): Promise<SyncControlResponse> => Promise.resolve({ ok: true })
  ),
};

const onChanged = {
  addListener: vi.fn((listener: StorageChangeListener) => {
    changeListener = listener;
  }),
};

let storageMock: MockChromeStorage;
let changeListener: StorageChangeListener | undefined;

/** Flushes the microtask queue so a controller's async hydrate()/send() settle before assertions. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function emitChange(changes: StorageChangeMap, area = 'local'): void {
  if (changeListener === undefined) {
    throw new Error('expected a storage.onChanged listener to be registered');
  }
  changeListener(changes, area);
}

beforeEach(() => {
  storageMock = createChromeStorageMock();
  changeListener = undefined;
  runtime.sendMessage.mockReset();
  runtime.sendMessage.mockImplementation(() => Promise.resolve({ ok: true }));
  onChanged.addListener.mockClear();
  (chrome as unknown as { runtime: typeof runtime }).runtime = runtime;
  (
    chrome as unknown as {
      storage: { local: MockChromeStorage; onChanged: typeof onChanged };
    }
  ).storage = { local: storageMock, onChanged };
});

describe('BridgeSyncController: hydrate/reconcile', () => {
  it('starts at "off" synchronously, before hydration resolves', () => {
    storageMock.data[STATUS_KEY] = 'active';

    const controller = new BridgeSyncController();

    expect(controller.getStatus()).toBe('off');
  });

  it('hydrates the cached status from the persisted status key', async () => {
    storageMock.data[STATUS_KEY] = 'active';

    const controller = new BridgeSyncController();
    await flush();

    expect(controller.getStatus()).toBe('active');
  });

  it('reconciles cloudSyncEnabled=true with no status key to "active"', async () => {
    storageMock.data[CLOUD_SYNC_ENABLED_KEY] = true;

    const controller = new BridgeSyncController();
    await flush();

    expect(controller.getStatus()).toBe('active');
  });

  it('defaults to "off" when neither the status key nor cloudSyncEnabled is set', async () => {
    const controller = new BridgeSyncController();
    await flush();

    expect(controller.getStatus()).toBe('off');
  });

  it('fires subscribers once hydration completes', async () => {
    storageMock.data[STATUS_KEY] = 'active';
    const controller = new BridgeSyncController();
    const cb = vi.fn();
    controller.subscribe(cb);

    await flush();

    expect(cb).toHaveBeenCalledWith('active');
  });
});

describe('BridgeSyncController: storage change listener', () => {
  it('notifies subscribers on a status change', async () => {
    const controller = new BridgeSyncController();
    await flush();
    const cb = vi.fn();
    controller.subscribe(cb);

    emitChange({ [STATUS_KEY]: { newValue: 'error', oldValue: 'active' } });

    expect(cb).toHaveBeenCalledWith('error');
    expect(controller.getStatus()).toBe('error');
  });

  it('ignores changes reported for a non-local area', async () => {
    const controller = new BridgeSyncController();
    await flush();

    emitChange({ [STATUS_KEY]: { newValue: 'error' } }, 'sync');

    expect(controller.getStatus()).toBe('off');
  });

  it('ignores a status removal (newValue undefined)', async () => {
    storageMock.data[STATUS_KEY] = 'active';
    const controller = new BridgeSyncController();
    await flush();

    emitChange({ [STATUS_KEY]: { oldValue: 'active', newValue: undefined } });

    expect(controller.getStatus()).toBe('active');
  });

  it('toasts a generic warning on a new lastQuarantineAt value, with no entity content', async () => {
    const toast = vi.fn();
    new BridgeSyncController({ toast });
    await flush();

    emitChange({ [QUARANTINE_KEY]: { newValue: Date.now() } });

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("A synced item couldn't be read and was skipped");
  });

  it('does not toast without a toast callback configured', async () => {
    new BridgeSyncController();
    await flush();

    expect(() => emitChange({ [QUARANTINE_KEY]: { newValue: Date.now() } })).not.toThrow();
  });
});

describe('BridgeSyncController: enable', () => {
  it('sends the enable control message with accountId/deviceName/recoveryCode', async () => {
    const controller = new BridgeSyncController();

    await controller.enable('acc-1', 'Device A', 'CW1-CODE');

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-control',
      op: 'enable',
      accountId: 'acc-1',
      deviceName: 'Device A',
      recoveryCode: 'CW1-CODE',
    });
  });

  it('persists accountId/deviceName and returns the mapped result on success', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: true, recoveryCode: 'NEWCODE' });
    const controller = new BridgeSyncController();

    const result = await controller.enable('acc-1', 'Device A');

    expect(result).toEqual({ ok: true, recoveryCode: 'NEWCODE' });
    expect(storageMock.set).toHaveBeenCalledWith({
      [LAST_SYNC_CREDS_KEY]: { accountId: 'acc-1', deviceName: 'Device A' },
    });
  });

  it('never writes the recovery code to storage', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: true, recoveryCode: 'NEWCODE' });
    const controller = new BridgeSyncController();

    await controller.enable('acc-1', 'Device A');

    for (const call of storageMock.set.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('NEWCODE');
    }
  });

  it('does not persist creds on a non-ok response', async () => {
    runtime.sendMessage.mockResolvedValueOnce({
      ok: false,
      reason: 'bad-code',
      detail: 'checksum',
    });
    const controller = new BridgeSyncController();

    const result = await controller.enable('acc-1', 'Device A', 'bad-code');

    expect(result).toEqual({ ok: false, reason: 'bad-code', detail: 'checksum' });
    expect(storageMock.set).not.toHaveBeenCalled();
  });

  it('maps a timed-out send to an error result instead of throwing', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    runtime.sendMessage.mockImplementation(() => new Promise(() => {}));
    const controller = new BridgeSyncController({ timeoutMs: 10 });

    const result = await controller.enable('acc-1', 'Device A');

    expect(result).toEqual({ ok: false, reason: 'error' });
    expect(storageMock.set).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('BridgeSyncController: reconnect', () => {
  it('returns an error result without sending when no creds are persisted', async () => {
    const controller = new BridgeSyncController();

    const result = await controller.reconnect();

    expect(result).toEqual({ ok: false, reason: 'error' });
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('replays the persisted accountId/deviceName with no recovery code', async () => {
    storageMock.data[LAST_SYNC_CREDS_KEY] = { accountId: 'acc-1', deviceName: 'Device A' };
    const controller = new BridgeSyncController();

    const result = await controller.reconnect();

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-control',
      op: 'reconnect',
      accountId: 'acc-1',
      deviceName: 'Device A',
    });
    expect(result).toEqual({ ok: true });
  });

  it('maps a timed-out send to an error result instead of throwing', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    storageMock.data[LAST_SYNC_CREDS_KEY] = { accountId: 'acc-1', deviceName: 'Device A' };
    runtime.sendMessage.mockImplementation(() => new Promise(() => {}));
    const controller = new BridgeSyncController({ timeoutMs: 10 });

    const result = await controller.reconnect();

    expect(result).toEqual({ ok: false, reason: 'error' });
    errorSpy.mockRestore();
  });
});

describe('BridgeSyncController: disable / syncNow', () => {
  it('sends the disable op', async () => {
    const controller = new BridgeSyncController();

    await controller.disable();

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-control',
      op: 'disable',
    });
  });

  it('sends the syncNow op', async () => {
    const controller = new BridgeSyncController();

    await controller.syncNow();

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-control',
      op: 'syncNow',
    });
  });

  it('swallows a timed-out send rather than throwing', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    runtime.sendMessage.mockImplementation(() => new Promise(() => {}));
    const controller = new BridgeSyncController({ timeoutMs: 10 });

    await expect(controller.disable()).resolves.toBeUndefined();

    errorSpy.mockRestore();
  });
});

describe('BridgeSyncController: regenerateRecoveryCode', () => {
  it('returns the new code on an ok response and never persists it', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: true, recoveryCode: 'NEWCODE' });
    const controller = new BridgeSyncController();

    const code = await controller.regenerateRecoveryCode();

    expect(code).toBe('NEWCODE');
    expect(storageMock.set).not.toHaveBeenCalled();
  });

  it('rejects on a non-ok response', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'error' });
    const controller = new BridgeSyncController();

    await expect(controller.regenerateRecoveryCode()).rejects.toThrow();
  });

  it('rejects when the response is ok but missing a code', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: true });
    const controller = new BridgeSyncController();

    await expect(controller.regenerateRecoveryCode()).rejects.toThrow();
  });

  it('rejects on a timed-out send', async () => {
    runtime.sendMessage.mockImplementation(() => new Promise(() => {}));
    const controller = new BridgeSyncController({ timeoutMs: 10 });

    await expect(controller.regenerateRecoveryCode()).rejects.toThrow();
  });
});
