import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeNotifier } from './chrome-notifier';

type ClickListener = (id: string) => void;
type ButtonListener = (id: string, buttonIndex: number) => void;

const notifications = {
  create: vi.fn((_id: string, _options: unknown) => Promise.resolve('id')),
  clear: vi.fn((_id: string) => Promise.resolve(true)),
  onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
  onButtonClicked: { addListener: vi.fn(), removeListener: vi.fn() },
};

beforeEach(() => {
  const c = chrome as unknown as {
    notifications?: typeof notifications;
    runtime: { getURL: (path: string) => string };
  };
  c.notifications = notifications;
  c.runtime = { getURL: (path) => `chrome-extension://abc/${path}` };
  notifications.create.mockClear();
  notifications.clear.mockClear();
  notifications.onClicked.addListener.mockClear();
  notifications.onClicked.removeListener.mockClear();
  notifications.onButtonClicked.addListener.mockClear();
});

describe('ChromeNotifier', () => {
  it('creates a basic notification, mapping body→message and actions→buttons', async () => {
    await new ChromeNotifier().notify({
      id: 'reminder-1',
      title: '🔔 Reminder',
      body: 'Drink water',
      actions: ['Done', 'Snooze 5 min'],
      requireInteraction: true,
    });

    expect(notifications.create).toHaveBeenCalledWith(
      'reminder-1',
      expect.objectContaining({
        type: 'basic',
        title: '🔔 Reminder',
        message: 'Drink water',
        requireInteraction: true,
        buttons: [{ title: 'Done' }, { title: 'Snooze 5 min' }],
      })
    );
  });

  it('omits buttons when no actions are given', async () => {
    await new ChromeNotifier().notify({ id: 'pomodoro', title: 'Pomodoro Timer', body: 'Done!' });

    const options = notifications.create.mock.calls[0][1] as { buttons?: unknown };
    expect(options.buttons).toBeUndefined();
  });

  it('clears a notification by id', async () => {
    await new ChromeNotifier().clear('reminder-1');

    expect(notifications.clear).toHaveBeenCalledWith('reminder-1');
  });

  it('routes click events to the handler and unsubscribes cleanly', () => {
    const handler = vi.fn();

    const unsubscribe = new ChromeNotifier().onClick(handler);
    const listener = notifications.onClicked.addListener.mock.calls[0][0] as ClickListener;
    listener('reminder-9');

    expect(handler).toHaveBeenCalledWith('reminder-9');

    unsubscribe();
    expect(notifications.onClicked.removeListener).toHaveBeenCalledWith(listener);
  });

  it('routes action-button events to the handler with the button index', () => {
    const handler = vi.fn();

    new ChromeNotifier().onAction(handler);
    const listener = notifications.onButtonClicked.addListener.mock.calls[0][0] as ButtonListener;
    listener('reminder-9', 1);

    expect(handler).toHaveBeenCalledWith('reminder-9', 1);
  });
});
