import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isPermissionGrantedMock = vi.fn<() => Promise<boolean>>();
const requestPermissionMock = vi.fn<() => Promise<'granted' | 'denied' | 'default'>>();
const sendNotificationMock = vi.fn();

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: () => isPermissionGrantedMock(),
  requestPermission: () => requestPermissionMock(),
  sendNotification: (options: unknown) => sendNotificationMock(options),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import { TauriNotifier, WebNotifier } from './index';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TauriNotifier.permission', () => {
  it('reports granted when the plugin has permission', async () => {
    isPermissionGrantedMock.mockResolvedValue(true);

    expect(await new TauriNotifier().permission()).toBe('granted');
  });

  // The plugin cannot separate denied from unasked, so it must not claim either.
  it('reports unknown, never denied, when the plugin has no permission', async () => {
    isPermissionGrantedMock.mockResolvedValue(false);

    expect(await new TauriNotifier().permission()).toBe('unknown');
  });
});

describe('TauriNotifier.notify', () => {
  it('asks for permission once when it is missing, then sends', async () => {
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue('granted');

    await new TauriNotifier().notify({ id: 'reminder-1', title: 'T', body: 'B' });

    expect(requestPermissionMock).toHaveBeenCalledOnce();
    expect(sendNotificationMock).toHaveBeenCalledWith({ title: 'T', body: 'B' });
  });

  it('sends nothing when permission is refused', async () => {
    isPermissionGrantedMock.mockResolvedValue(false);
    requestPermissionMock.mockResolvedValue('denied');

    await new TauriNotifier().notify({ id: 'reminder-1', title: 'T', body: 'B' });

    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});

function stubNotification(permission: 'granted' | 'denied' | 'default'): void {
  const mock = vi.fn();
  (mock as unknown as { permission: string }).permission = permission;
  vi.stubGlobal('Notification', mock);
}

describe('WebNotifier.permission', () => {
  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['default', 'unknown'],
  ] as const)('maps the web permission %s to %s', async (web, expected) => {
    stubNotification(web);

    expect(await new WebNotifier().permission()).toBe(expected);
  });

  it('reports unknown where there is no Notification API', async () => {
    vi.stubGlobal('Notification', undefined);

    expect(await new WebNotifier().permission()).toBe('unknown');
  });
});
