import type { NotifierHost, NotifyOptions } from '@cuewise/shared';

/**
 * Notifier for contexts without chrome.notifications (dev/web): delivers via the
 * web Notification API when the user has granted permission. Interaction
 * callbacks (click/action buttons) aren't available, so they no-op.
 */
export class WebNotifier implements NotifierHost {
  async notify(opts: NotifyOptions): Promise<void> {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(opts.title, { body: opts.body });
    }
  }

  async clear(_id: string): Promise<void> {}

  onClick(_handler: (id: string) => void | Promise<void>): () => void {
    return () => {};
  }

  onAction(_handler: (id: string, actionIndex: number) => void | Promise<void>): () => void {
    return () => {};
  }
}
