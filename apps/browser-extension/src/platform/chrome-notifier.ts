import { logger, type NotifierHost, type NotifyOptions } from '@cuewise/shared';

const ICON_PATH = 'icons/icon-128.png';

/** Notifier backed by chrome.notifications (selected only where the API exists). */
export class ChromeNotifier implements NotifierHost {
  async notify(opts: NotifyOptions): Promise<void> {
    const options: chrome.notifications.NotificationCreateOptions = {
      type: 'basic',
      iconUrl: chrome.runtime.getURL(ICON_PATH),
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
  }

  async clear(id: string): Promise<void> {
    await chrome.notifications.clear(id);
  }

  onClick(handler: (id: string) => void | Promise<void>): () => void {
    const listener = async (id: string) => {
      try {
        await handler(id);
      } catch (error) {
        logger.error('Notifier onClick handler failed', error);
      }
    };
    chrome.notifications.onClicked.addListener(listener);
    return () => {
      chrome.notifications.onClicked.removeListener(listener);
    };
  }

  onAction(handler: (id: string, actionIndex: number) => void | Promise<void>): () => void {
    const listener = async (id: string, buttonIndex: number) => {
      try {
        await handler(id, buttonIndex);
      } catch (error) {
        logger.error('Notifier onAction handler failed', error);
      }
    };
    chrome.notifications.onButtonClicked.addListener(listener);
    return () => {
      chrome.notifications.onButtonClicked.removeListener(listener);
    };
  }
}
