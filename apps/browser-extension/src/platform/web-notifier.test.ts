import { logger } from '@cuewise/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebNotifier } from './web-notifier';

function stubNotification(permission: NotificationPermission) {
  const mock = vi.fn();
  (mock as unknown as { permission: NotificationPermission }).permission = permission;
  vi.stubGlobal('Notification', mock);
  return mock;
}

describe('WebNotifier', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers via the web Notification API when permission is granted', async () => {
    const notification = stubNotification('granted');

    await new WebNotifier().notify({ id: 'x', title: 'Pomodoro Timer', body: 'Done!' });

    expect(notification).toHaveBeenCalledWith('Pomodoro Timer', { body: 'Done!' });
  });

  // At error level: the shipped log level is 'error', and a silent non-delivery is what this
  // adapter used to do.
  it('delivers nothing when permission is not granted, and says so', async () => {
    const notification = stubNotification('denied');
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await new WebNotifier().notify({ id: 'x', title: 'T', body: 'B' });

    expect(notification).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      'Web notification not delivered: permission not granted',
      undefined,
      { id: 'x' }
    );
  });

  it('exposes no-op interaction subscriptions', () => {
    const notifier = new WebNotifier();

    expect(() => notifier.onClick(() => {})()).not.toThrow();
    expect(() => notifier.onAction(() => {})()).not.toThrow();
  });

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
