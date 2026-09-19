import { logger } from '@cuewise/shared';
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

describe('WebNotifier.notify', () => {
  it('delivers through the web API when permission is granted', async () => {
    stubNotification('granted');

    await new WebNotifier().notify({ id: 'reminder-1', title: 'T', body: 'B' });

    expect(vi.mocked(Notification)).toHaveBeenCalledWith('T', { body: 'B', tag: 'reminder-1' });
  });

  it('delivers nothing when permission is not granted, and says so', async () => {
    stubNotification('default');
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await new WebNotifier().notify({ id: 'reminder-1', title: 'T', body: 'B' });

    expect(vi.mocked(Notification)).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      'Web notification not delivered: permission not granted',
      undefined,
      { id: 'reminder-1' }
    );
  });
});

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
