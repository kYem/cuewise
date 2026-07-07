import { configurePlatform } from '@cuewise/shared';
import { ChromeNotifier } from './chrome-notifier';
import { ChromeScheduler } from './chrome-scheduler';

export { ChromeNotifier } from './chrome-notifier';
export { ChromeScheduler } from './chrome-scheduler';

/**
 * Bind the Chrome scheduler/notifier and return them, so a resident context (the
 * service worker) can subscribe on the same instances it registered. Call once
 * per JS entry point.
 */
export function configureChromePlatform(): {
  scheduler: ChromeScheduler;
  notifier: ChromeNotifier;
} {
  const scheduler = new ChromeScheduler();
  const notifier = new ChromeNotifier();
  configurePlatform({ scheduler, notifier });
  return { scheduler, notifier };
}
