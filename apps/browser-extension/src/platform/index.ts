import { configurePlatform, type NotifierHost, type SchedulerHost } from '@cuewise/shared';
import { ChromeNotifier } from './chrome-notifier';
import { ChromeScheduler } from './chrome-scheduler';
import { NoopScheduler } from './noop-scheduler';
import { WebNotifier } from './web-notifier';

/**
 * Detect platform capabilities once and bind the matching adapters — Chrome in
 * the extension, dev fallbacks under the vite dev server. Returns the instances
 * so a resident context (the service worker) can subscribe on them.
 *
 * `typeof chrome` (not `chrome?.`) so an undeclared `chrome` global degrades to
 * the fallback instead of throwing a ReferenceError.
 */
export function configureChromePlatform(): { scheduler: SchedulerHost; notifier: NotifierHost } {
  const hasChrome = typeof chrome !== 'undefined';
  const scheduler: SchedulerHost =
    hasChrome && chrome.alarms ? new ChromeScheduler() : new NoopScheduler();
  const notifier: NotifierHost =
    hasChrome && chrome.notifications ? new ChromeNotifier() : new WebNotifier();
  configurePlatform({ scheduler, notifier });
  return { scheduler, notifier };
}
