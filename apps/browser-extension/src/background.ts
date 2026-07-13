/**
 * Background service worker: schedules reminder wake-ups and delivers their
 * notifications through the platform Scheduler/Notifier ports.
 */

import { handleReminderFire } from '@cuewise/app/reminder-notifications';
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
import { handleSyncMessage } from './sync/handle-sync-message';

const { scheduler, notifier } = configureChromePlatform();

// Fire a reminder's notification when its scheduled time arrives. The lookup +
// deliver + recurring re-arm logic is shared with the macOS app so both platforms
// behave identically.
scheduler.onFire(handleReminderFire);

// ENG-45 cloud sync: off by default — no enable-sync UI ships yet. Set
// VITE_SYNC_API_BASE_URL locally (pointed at `wrangler dev`, e.g. localhost:8787) to
// resume/self-heal a session that was enabled some other way (e.g. devtools).
const syncApiBaseUrl = import.meta.env.VITE_SYNC_API_BASE_URL;
if (syncApiBaseUrl) {
  const syncEngine = createSyncEngine({
    baseUrl: syncApiBaseUrl,
    keyStore: getStorage(),
    scheduler,
  });
  scheduler.onFire((id) => {
    if (id === SYNC_PULL_WAKE_ID) {
      syncEngine.handlePullWake();
    }
  });
  syncEngine.start().catch((error) => {
    logger.error('Sync engine failed to start', error);
  });

  // ENG-45 option B: the page realm relays its store mutations here (this
  // service-worker realm is the single sync owner) instead of holding its own
  // SyncEngine. The SW's own self-registered sink (from createSyncEngine) is
  // unused here but harmless — nothing in this realm calls notifyMutated etc.
  chrome.runtime.onMessage.addListener((msg) => {
    handleSyncMessage(syncEngine, msg);
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
