import { logger, type Notifier, type NotifyOptions, type SchedulerHost } from '@cuewise/shared';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

/**
 * Platform adapters for the Tauri build. Storage is `LocalStorageKeyValueStore`
 * (wired in main.tsx — the WKWebView has localStorage), notifications go through
 * the Tauri plugin, and scheduling delegates to the Rust core so wakes fire while
 * the window is hidden.
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
 * Scheduler backed by the Rust core (`src-tauri/src/scheduler.rs`). Timers live
 * in native code so they fire while the window is hidden, where the webview's
 * own `setTimeout`s would be throttled. On fire, Rust emits `scheduler://fire`
 * with the wake id; the JS host (main.tsx) looks up and delivers the reminder.
 *
 * Wakes are in-memory in the Rust process, so they don't survive an app restart
 * (`persistsAcrossRestarts = false`) — the reminder store re-arms pending ones
 * from storage on startup.
 */
export class TauriScheduler implements SchedulerHost {
  readonly deliversInBackground = true;
  readonly persistsAcrossRestarts = false;

  async scheduleAt(id: string, when: Date): Promise<void> {
    await invoke('schedule_wake', { id, whenMs: when.getTime() });
  }

  async cancel(id: string): Promise<void> {
    await invoke('cancel_wake', { id });
  }

  onFire(handler: (id: string) => void | Promise<void>): () => void {
    // `listen` resolves its unsubscribe fn asynchronously; hold it (or unlisten
    // immediately if disposed before it arrives) so onFire stays synchronous.
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen<string>('scheduler://fire', async (event) => {
      try {
        await handler(event.payload);
      } catch (error) {
        logger.error('Scheduler onFire handler failed', error);
      }
    })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((error) => logger.error('Failed to subscribe to scheduler fires', error));
    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }
}

/**
 * No-op scheduler for the web / e2e context where the Tauri IPC isn't present.
 * Delivers nothing in the background, so the reminder store falls back to its
 * in-page poll.
 */
export class NoopScheduler implements SchedulerHost {
  readonly deliversInBackground = false;
  readonly persistsAcrossRestarts = false;

  async scheduleAt(_id: string, _when: Date): Promise<void> {}
  async cancel(_id: string): Promise<void> {}

  onFire(_handler: (id: string) => void | Promise<void>): () => void {
    return () => {};
  }
}
