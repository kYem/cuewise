import { describe, expect, it } from 'vitest';
import { ChromeNotifier } from './chrome-notifier';
import { ChromeScheduler } from './chrome-scheduler';
import { configureChromePlatform } from './index';
import { NoopScheduler } from './noop-scheduler';
import { WebNotifier } from './web-notifier';

describe('configureChromePlatform', () => {
  it('binds the Chrome adapters when the chrome APIs exist', () => {
    const c = chrome as unknown as { alarms: unknown; notifications: unknown };
    c.alarms = {};
    c.notifications = {};

    const { scheduler, notifier } = configureChromePlatform();

    expect(scheduler).toBeInstanceOf(ChromeScheduler);
    expect(notifier).toBeInstanceOf(ChromeNotifier);
  });

  it('falls back to the dev adapters when the chrome APIs are absent', () => {
    // The global setup installs chrome.storage only — no alarms/notifications.
    const { scheduler, notifier } = configureChromePlatform();

    expect(scheduler).toBeInstanceOf(NoopScheduler);
    expect(notifier).toBeInstanceOf(WebNotifier);
  });
});
