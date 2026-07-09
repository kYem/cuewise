import type { Notifier, NotifyOptions, Scheduler } from '@cuewise/shared';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

/**
 * Platform seams for the Tauri build. Storage is `LocalStorageKeyValueStore`
 * (wired in main.tsx — the WKWebView has localStorage). Notifier/scheduler live
 * here until the Rust core hosts real background scheduling (see ENG-40).
 */

/** Web Notification API notifier — works inside the Tauri WKWebView. */
export class WebNotifier implements Notifier {
  async notify(opts: NotifyOptions): Promise<void> {
    // Only deliver when permission is already granted. Requesting it must come
    // from a user gesture (WebKit errors otherwise), so that belongs in a
    // settings action — and real OS notifications move to the Tauri notification
    // plugin later. Until then this placeholder no-ops rather than nag.
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }
    new Notification(opts.title, { body: opts.body, tag: opts.id });
  }

  async clear(_id: string): Promise<void> {
    // Web notifications auto-dismiss; nothing to clear.
  }
}

/**
 * Native OS notifications via the Tauri notification plugin — these fire even
 * when the window is hidden, which the extension's tab-scoped web notifications
 * cannot. Permission is requested lazily on first use (a native prompt, not the
 * gesture-restricted web API).
 */
export class TauriNotifier implements Notifier {
  async notify(opts: NotifyOptions): Promise<void> {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === 'granted';
    }
    if (granted) {
      sendNotification({ title: opts.title, body: opts.body });
    }
  }

  async clear(_id: string): Promise<void> {
    // The plugin exposes no programmatic clear for delivered notifications.
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
