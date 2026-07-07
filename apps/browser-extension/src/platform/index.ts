import { configurePlatform } from '@cuewise/shared';
import { ChromeNotifier } from './chrome-notifier';
import { ChromeScheduler } from './chrome-scheduler';

export { ChromeNotifier } from './chrome-notifier';
export { ChromeScheduler } from './chrome-scheduler';

/** Bind the Chrome platform implementations. Call once per JS entry point. */
export function configureChromePlatform(): void {
  configurePlatform({ scheduler: new ChromeScheduler(), notifier: new ChromeNotifier() });
}
