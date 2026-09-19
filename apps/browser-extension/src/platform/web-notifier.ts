import {
  logger,
  type NotifierHost,
  type NotifierPermission,
  type NotifyOptions,
} from '@cuewise/shared';

/**
 * Notifier for contexts without chrome.notifications (dev/web): delivers via the
 * web Notification API when the user has granted permission. Interaction
 * callbacks (click/action buttons) aren't available, so they no-op.
 */
export class WebNotifier implements NotifierHost {
  async notify(opts: NotifyOptions): Promise<void> {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      logger.warn('Web notification not delivered: permission not granted', { id: opts.id });
      return;
    }
    new Notification(opts.title, { body: opts.body });
  }

  async clear(_id: string): Promise<void> {}

  async permission(): Promise<NotifierPermission> {
    if (typeof Notification === 'undefined' || Notification.permission === 'default') {
      return 'unknown';
    }
    return Notification.permission;
  }

  onClick(_handler: (id: string) => void | Promise<void>): () => void {
    return () => {};
  }

  onAction(_handler: (id: string, actionIndex: number) => void | Promise<void>): () => void {
    return () => {};
  }
}
