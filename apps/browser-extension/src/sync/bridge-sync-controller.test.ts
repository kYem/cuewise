import { logger } from '@cuewise/shared';
import { CLOUD_SYNC_ENABLED_KEY } from '@cuewise/sync-engine';
import { createChromeStorageMock, type MockChromeStorage } from '@cuewise/test-utils/mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeSyncController } from './bridge-sync-controller';
import type { SyncControlAnyResponse } from './sync-control-messages';
import { LAST_SYNC_CREDS_KEY, QUARANTINE_KEY, STATUS_KEY } from './sync-storage-keys';

type StorageChangeMap = { [key: string]: chrome.storage.StorageChange };
type StorageChangeListener = (changes: StorageChangeMap, area: string) => void;

const runtime = {
  sendMessage: vi.fn(
    (_message: unknown): Promise<SyncControlAnyResponse> => Promise.resolve({ ok: true })
  ),
};

const onChanged = {
  addListener: vi.fn((listener: StorageChangeListener) => {
    changeListener = listener;
  }),
};

const REDIRECT_URI = 'https://abjkbnhoepcnmbabflkedbapbldnpkbf.chromiumapp.org/';

const identity = {
  getRedirectURL: vi.fn(() => REDIRECT_URI),
  launchWebAuthFlow: vi.fn(
    (): Promise<string | undefined> => Promise.resolve(`${REDIRECT_URI}#id_token=fake.jwt.token`)
  ),
};

const permissions = {
  request: vi.fn((): Promise<boolean> => Promise.resolve(true)),
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
  identity.getRedirectURL.mockReset();
  identity.getRedirectURL.mockReturnValue(REDIRECT_URI);
  identity.launchWebAuthFlow.mockReset();
  identity.launchWebAuthFlow.mockResolvedValue(`${REDIRECT_URI}#id_token=fake.jwt.token`);
  permissions.request.mockReset();
  permissions.request.mockResolvedValue(true);
  (chrome as unknown as { runtime: typeof runtime }).runtime = runtime;
  (chrome as unknown as { identity: typeof identity }).identity = identity;
  (chrome as unknown as { permissions: typeof permissions }).permissions = permissions;
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

describe('BridgeSyncController: getDetails', () => {
  it('sends the details op and returns the relayed details', async () => {
    const details = { accountEmail: 'kes@example.com', accountId: 'u1', lastSyncedAt: 123 };
    runtime.sendMessage.mockResolvedValueOnce({ ok: true, kind: 'details', details });
    const controller = new BridgeSyncController();

    await expect(controller.getDetails()).resolves.toEqual(details);
    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-control',
      op: 'details',
    });
  });

  it('resolves null when messaging fails, without throwing', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    runtime.sendMessage.mockRejectedValueOnce(new Error('no SW'));
    const controller = new BridgeSyncController();

    await expect(controller.getDetails()).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('resolves null when a legacy SW answers without a details field', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'error' });
    const controller = new BridgeSyncController();

    await expect(controller.getDetails()).resolves.toBeNull();
  });

  it('resolves null when no listener responds at all (undefined response)', async () => {
    // A truly-legacy SW rejects the unknown op in its message guard, so sendMessage resolves
    // undefined. Assert the *unavailable* message specifically: dropping the `?.` would throw a
    // TypeError that the catch turns into the same null, so `resolves.toBeNull()` alone cannot
    // tell the explicit guard apart from an accidental throw.
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    runtime.sendMessage.mockResolvedValueOnce(undefined as never);
    const controller = new BridgeSyncController();

    await expect(controller.getDetails()).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'Sync details unavailable (no responder or error fallback)'
    );
    warnSpy.mockRestore();
  });

  it('resolves null when a pre-kind SW answers with details but no kind tag', async () => {
    // This is the input the kind guard actually buys: the old `'details' in response` check would
    // have returned these stale details. Also pins the warn (a skew must not be traceless).
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const details = { accountEmail: 'stale@example.com', accountId: 'u1', lastSyncedAt: 1 };
    runtime.sendMessage.mockResolvedValueOnce({ ok: true, details } as never);
    const controller = new BridgeSyncController();

    await expect(controller.getDetails()).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'Sync details unavailable (no responder or error fallback)'
    );
    warnSpy.mockRestore();
  });
});

describe('BridgeSyncController: enable', () => {
  it('sends the enable control message with provider "dev", credential, deviceName, recoveryCode', async () => {
    const controller = new BridgeSyncController();

    await controller.enable('acc-1', 'Device A', 'CW1-CODE');

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-control',
      op: 'enable',
      provider: 'dev',
      credential: 'acc-1',
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
      [LAST_SYNC_CREDS_KEY]: { provider: 'dev', accountId: 'acc-1', deviceName: 'Device A' },
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

describe('BridgeSyncController: enableWithGoogle', () => {
  it('requests the identity permission, launches the auth flow, and relays the id token', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: true, recoveryCode: 'NEWCODE' });
    const controller = new BridgeSyncController({
      googleClientId: 'client-id.apps.googleusercontent.com',
    });

    const result = await controller.enableWithGoogle('Device A', 'CW1-CODE');

    expect(permissions.request).toHaveBeenCalledWith({ permissions: ['identity'] });
    expect(identity.launchWebAuthFlow).toHaveBeenCalledWith(
      expect.objectContaining({ interactive: true })
    );
    expect(runtime.sendMessage).toHaveBeenCalledWith({
      kind: 'cuewise-sync-control',
      op: 'enable',
      provider: 'google',
      credential: 'fake.jwt.token',
      deviceName: 'Device A',
      recoveryCode: 'CW1-CODE',
    });
    expect(result).toEqual({ ok: true, recoveryCode: 'NEWCODE' });
  });

  it('never writes the id token to chrome.storage', async () => {
    const controller = new BridgeSyncController({ googleClientId: 'client-id' });

    await controller.enableWithGoogle('Device A');

    for (const call of storageMock.set.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('fake.jwt.token');
    }
  });

  it('persists { provider: "google", deviceName } on success so reconnect can re-auth', async () => {
    const controller = new BridgeSyncController({ googleClientId: 'client-id' });

    await controller.enableWithGoogle('Device A');

    expect(storageMock.set).toHaveBeenCalledWith({
      [LAST_SYNC_CREDS_KEY]: { provider: 'google', deviceName: 'Device A' },
    });
  });

  it('returns a configuration error without touching permissions when googleClientId is unset', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const controller = new BridgeSyncController();

    const result = await controller.enableWithGoogle('Device A');

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      detail: 'Google sign-in is not configured',
    });
    expect(permissions.request).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('canEnableWithGoogle reflects whether a googleClientId is configured', () => {
    expect(new BridgeSyncController({ googleClientId: 'client-id' }).canEnableWithGoogle()).toBe(
      true
    );
    expect(new BridgeSyncController({ googleClientId: '' }).canEnableWithGoogle()).toBe(false);
    expect(new BridgeSyncController().canEnableWithGoogle()).toBe(false);
  });

  it('returns an auth error without launching the flow when the identity permission is denied', async () => {
    permissions.request.mockResolvedValueOnce(false);
    const controller = new BridgeSyncController({ googleClientId: 'client-id' });

    const result = await controller.enableWithGoogle('Device A');

    expect(result).toEqual({ ok: false, reason: 'auth' });
    expect(identity.launchWebAuthFlow).not.toHaveBeenCalled();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('treats an empty-string googleClientId as unset (the Vite/CI unset value)', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const controller = new BridgeSyncController({ googleClientId: '' });

    const result = await controller.enableWithGoogle('Device A');

    expect(result).toEqual({
      ok: false,
      reason: 'error',
      detail: 'Google sign-in is not configured',
    });
    expect(permissions.request).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('returns an auth error when requesting the identity permission throws', async () => {
    permissions.request.mockRejectedValueOnce(new Error('user gesture required'));
    const controller = new BridgeSyncController({ googleClientId: 'client-id' });

    const result = await controller.enableWithGoogle('Device A');

    expect(result).toEqual({ ok: false, reason: 'auth' });
    expect(identity.launchWebAuthFlow).not.toHaveBeenCalled();
  });

  it('returns an auth error when the auth flow fails or is cancelled', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    identity.launchWebAuthFlow.mockRejectedValueOnce(new Error('user did not approve access'));
    const controller = new BridgeSyncController({ googleClientId: 'client-id' });

    const result = await controller.enableWithGoogle('Device A');

    expect(result).toEqual({ ok: false, reason: 'auth' });
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("never claims a quiet cancel for Chromium's window-closed message", async () => {
    // Chromium emits this exact message for ANY auth-window close — including the user closing
    // a Google-side ERROR page (misconfig). Mapping it to detail:'cancelled' would let the UI
    // silence real failures, so the result must stay a plain (toasting) auth error.
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    identity.launchWebAuthFlow.mockRejectedValueOnce(new Error('The user did not approve access.'));
    const controller = new BridgeSyncController({ googleClientId: 'client-id' });

    const result = await controller.enableWithGoogle('Device A');

    expect(result).toEqual({ ok: false, reason: 'auth' });
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns an auth error when the redirect has no id_token fragment', async () => {
    identity.launchWebAuthFlow.mockResolvedValueOnce(REDIRECT_URI);
    const controller = new BridgeSyncController({ googleClientId: 'client-id' });

    const result = await controller.enableWithGoogle('Device A');

    expect(result).toEqual({ ok: false, reason: 'auth' });
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('BridgeSyncController: reconnect', () => {
  it('returns an error result without sending when no creds are persisted', async () => {
    const controller = new BridgeSyncController();

    const result = await controller.reconnect();

    expect(result).toEqual({ ok: false, reason: 'error' });
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  // Backward compat: a record written before `provider` existed (no provider field) still
  // reconnects via the dev path.
  it('replays a pre-provider dev record (no provider field) with no recovery code', async () => {
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

  it('re-runs the Google OAuth flow (never a reconnect op) when the persisted provider is google', async () => {
    storageMock.data[LAST_SYNC_CREDS_KEY] = { provider: 'google', deviceName: 'Device A' };
    const controller = new BridgeSyncController({ googleClientId: 'client-id' });

    const result = await controller.reconnect();

    expect(identity.launchWebAuthFlow).toHaveBeenCalled();
    expect(runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'enable', provider: 'google', credential: 'fake.jwt.token' })
    );
    expect(runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ op: 'reconnect' })
    );
    expect(result).toEqual({ ok: true });
  });

  it('forwards a supplied recovery code through the Google re-auth on reconnect', async () => {
    storageMock.data[LAST_SYNC_CREDS_KEY] = { provider: 'google', deviceName: 'Device A' };
    const controller = new BridgeSyncController({ googleClientId: 'client-id' });

    await controller.reconnect('CW1-CODE');

    expect(runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'enable', provider: 'google', recoveryCode: 'CW1-CODE' })
    );
  });

  it('rejects a dev-provider reconnect whose persisted creds lack an account id', async () => {
    storageMock.data[LAST_SYNC_CREDS_KEY] = { provider: 'dev', deviceName: 'Device A' };
    const controller = new BridgeSyncController();

    const result = await controller.reconnect();

    expect(result).toEqual({ ok: false, reason: 'error' });
    expect(runtime.sendMessage).not.toHaveBeenCalled();
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

  it('resolves disable() on an ok response', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: true });
    const controller = new BridgeSyncController();

    await expect(controller.disable()).resolves.toBeUndefined();
  });

  it('resolves syncNow() on an ok response', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: true });
    const controller = new BridgeSyncController();

    await expect(controller.syncNow()).resolves.toBeUndefined();
  });

  it('rejects disable() on a non-ok response instead of resolving silently', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'error' });
    const controller = new BridgeSyncController();

    await expect(controller.disable()).rejects.toThrow();
  });

  it('rejects syncNow() on a non-ok response instead of resolving silently', async () => {
    runtime.sendMessage.mockResolvedValueOnce({ ok: false, reason: 'error' });
    const controller = new BridgeSyncController();

    await expect(controller.syncNow()).rejects.toThrow();
  });

  it('rejects disable() on a timed-out send', async () => {
    runtime.sendMessage.mockImplementation(() => new Promise(() => {}));
    const controller = new BridgeSyncController({ timeoutMs: 10 });

    await expect(controller.disable()).rejects.toThrow();
  });

  it('rejects syncNow() on a timed-out send', async () => {
    runtime.sendMessage.mockImplementation(() => new Promise(() => {}));
    const controller = new BridgeSyncController({ timeoutMs: 10 });

    await expect(controller.syncNow()).rejects.toThrow();
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
