import { describe, expect, it, vi } from 'vitest';
import { WebNotifier } from './web-notifier';

function stubNotification(permission: NotificationPermission) {
  const mock = vi.fn();
  (mock as unknown as { permission: NotificationPermission }).permission = permission;
  globalThis.Notification = mock as unknown as typeof Notification;
  return mock;
}

describe('WebNotifier', () => {
  it('delivers via the web Notification API when permission is granted', async () => {
    const notification = stubNotification('granted');

    await new WebNotifier().notify({ id: 'x', title: 'Pomodoro Timer', body: 'Done!' });

    expect(notification).toHaveBeenCalledWith('Pomodoro Timer', { body: 'Done!' });
  });

  it('does nothing when permission is not granted', async () => {
    const notification = stubNotification('denied');

    await new WebNotifier().notify({ id: 'x', title: 'T', body: 'B' });

    expect(notification).not.toHaveBeenCalled();
  });

  it('exposes no-op interaction subscriptions', () => {
    const notifier = new WebNotifier();

    expect(() => notifier.onClick(() => {})()).not.toThrow();
    expect(() => notifier.onAction(() => {})()).not.toThrow();
  });
});
