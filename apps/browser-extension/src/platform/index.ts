import { configurePlatform, type NotifierHost, type SchedulerHost } from '@cuewise/shared';
import { ChromeNotifier } from './chrome-notifier';
import { ChromeScheduler } from './chrome-scheduler';
import { NoopScheduler } from './noop-scheduler';
import { WebNotifier } from './web-notifier';

export { ChromeNotifier } from './chrome-notifier';
export { ChromeScheduler } from './chrome-scheduler';
export { NoopScheduler } from './noop-scheduler';
export { WebNotifier } from './web-notifier';

/**
 * Detect platform capabilities once and bind the matching adapters — Chrome in
 * the extension, dev fallbacks under the vite dev server. Returns the instances
 * so a resident context (the service worker) can subscribe on them.
 */
export function configureChromePlatform(): { scheduler: SchedulerHost; notifier: NotifierHost } {
  const scheduler: SchedulerHost = chrome?.alarms ? new ChromeScheduler() : new NoopScheduler();
  const notifier: NotifierHost = chrome?.notifications ? new ChromeNotifier() : new WebNotifier();
  configurePlatform({ scheduler, notifier });
  return { scheduler, notifier };
}
