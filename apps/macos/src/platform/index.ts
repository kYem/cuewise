import { logger, type Notifier, type NotifyOptions, type Scheduler } from '@cuewise/shared';

/**
 * Platform seams for the Tauri build. Storage is `LocalStorageKeyValueStore`
 * (wired in main.tsx — the WKWebView has localStorage). Notifier/scheduler live
 * here until the Rust core hosts real background scheduling (see ENG-40).
 */

/** Web Notification API notifier — works inside the Tauri WKWebView. */
export class WebNotifier implements Notifier {
  async notify(opts: NotifyOptions): Promise<void> {
    if (typeof Notification === 'undefined') {
      logger.warn('Notifications unavailable in this context');
      return;
    }
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
      new Notification(opts.title, { body: opts.body, tag: opts.id });
    }
  }

  async clear(_id: string): Promise<void> {
    // Web notifications auto-dismiss; nothing to clear.
  }
}

/**
 * Placeholder scheduler. Real wakes must fire while the window is hidden, so
 * scheduling belongs in the Rust core (a `SchedulerHost`) — not the webview,
 * whose timers throttle in the background. Wired up in a later increment.
 */
export class NoopScheduler implements Scheduler {
  readonly deliversInBackground = false;

  async scheduleAt(_id: string, _when: Date): Promise<void> {}
  async cancel(_id: string): Promise<void> {}
}
