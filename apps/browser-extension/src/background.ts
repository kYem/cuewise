/**
 * Background service worker: schedules reminder wake-ups and delivers their
 * notifications through the platform Scheduler/Notifier ports.
 */

import { handleReminderFire } from '@cuewise/app/reminder-notifications';
import { setSyncEngine } from '@cuewise/app/sync-hook';
import {
  getStorage,
  logger,
  reminderAlarmId,
  reminderIdFromAlarm,
  resolveReminderNotificationAction,
} from '@cuewise/shared';
import { getReminders, setReminders } from '@cuewise/storage';
import { SYNC_PULL_WAKE_ID } from '@cuewise/sync-client';
import { createSyncEngine } from '@cuewise/sync-engine';
import { configureChromePlatform } from './platform';

const { scheduler, notifier } = configureChromePlatform();

// Fire a reminder's notification when its scheduled time arrives. The lookup +
// deliver + recurring re-arm logic is shared with the macOS app so both platforms
// behave identically.
scheduler.onFire(handleReminderFire);

// ENG-45 cloud sync: off by default — no enable-sync UI ships yet. Set
// VITE_CLOUD_SYNC=1 locally (pointed at `wrangler dev`, default localhost:8787) to
// resume/self-heal a session that was enabled some other way (e.g. devtools).
if (import.meta.env.VITE_CLOUD_SYNC === '1') {
  const syncEngine = createSyncEngine({
    baseUrl: import.meta.env.VITE_SYNC_API_BASE_URL ?? 'http://localhost:8787',
    keyStore: getStorage(),
    scheduler,
  });
  setSyncEngine(syncEngine);
  scheduler.onFire((id) => {
    if (id === SYNC_PULL_WAKE_ID) {
      syncEngine.handlePullWake();
    }
  });
  syncEngine.start().catch((error) => {
    logger.error('Sync engine failed to start', error);
  });
}

// Notification click → focus (or open) the extension's new-tab page.
notifier.onClick(async (notificationId) => {
  try {
    if (reminderIdFromAlarm(notificationId) === null) {
      return;
    }

    await notifier.clear(notificationId);

    const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('index.html') });

    if (tabs.length > 0 && tabs[0].id) {
      // Focus existing tab
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId || 0, { focused: true });
    } else {
      // Create new tab
      await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    }
  } catch (error) {
    logger.error('Error handling reminder notification click', error);
  }
});

// Notification action buttons (Done / Snooze 5 min).
notifier.onAction(async (notificationId, buttonIndex) => {
  try {
    const reminderId = reminderIdFromAlarm(notificationId);
    if (reminderId === null) {
      return;
    }
    const reminders = await getReminders();
    const reminder = reminders.find((r) => r.id === reminderId);
    const action = resolveReminderNotificationAction(reminder, buttonIndex, new Date());

    if (action.type === 'complete') {
      const updated = reminders.map((r) => (r.id === reminderId ? { ...r, completed: true } : r));
      await setReminders(updated);
    } else if (action.type === 'snooze') {
      const updated = reminders.map((r) =>
        r.id === reminderId
          ? { ...r, dueDate: action.dueDate, notified: false, completed: false }
          : r
      );
      await setReminders(updated);
      await scheduler.scheduleAt(reminderAlarmId(reminderId), new Date(action.dueDate));
    }

    await notifier.clear(notificationId);
  } catch (error) {
    logger.error('Error handling reminder notification button click', error);
  }
});
