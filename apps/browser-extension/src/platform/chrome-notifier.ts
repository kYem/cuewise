import type { NotifierHost, NotifyOptions } from '@cuewise/shared';

const ICON_PATH = 'icons/icon-128.png';

function iconUrl(): string {
  if (chrome?.runtime?.getURL) {
    return chrome.runtime.getURL(ICON_PATH);
  }
  return ICON_PATH;
}

/**
 * Notifier backed by chrome.notifications. `notify`/`clear` fall back to (or
 * no-op against) the web Notification API where chrome.notifications is absent
 * (dev/web); `onClick`/`onAction` assume a service-worker context.
 */
export class ChromeNotifier implements NotifierHost {
  async notify(opts: NotifyOptions): Promise<void> {
    if (chrome?.notifications) {
      const options: chrome.notifications.NotificationCreateOptions = {
        type: 'basic',
        iconUrl: iconUrl(),
        title: opts.title,
        message: opts.body,
        priority: 2,
      };
      if (opts.requireInteraction !== undefined) {
        options.requireInteraction = opts.requireInteraction;
      }
      if (opts.actions && opts.actions.length > 0) {
        options.buttons = opts.actions.map((title) => ({ title }));
      }
      await chrome.notifications.create(opts.id, options);
      return;
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(opts.title, { body: opts.body });
    }
  }

  async clear(id: string): Promise<void> {
    if (!chrome?.notifications) {
      return;
    }
    await chrome.notifications.clear(id);
  }

  onClick(handler: (id: string) => void | Promise<void>): () => void {
    const listener = (id: string) => {
      void handler(id);
    };
    chrome.notifications.onClicked.addListener(listener);
    return () => {
      chrome.notifications.onClicked.removeListener(listener);
    };
  }

  onAction(handler: (id: string, actionIndex: number) => void | Promise<void>): () => void {
    const listener = (id: string, buttonIndex: number) => {
      void handler(id, buttonIndex);
    };
    chrome.notifications.onButtonClicked.addListener(listener);
    return () => {
      chrome.notifications.onButtonClicked.removeListener(listener);
    };
  }
}
