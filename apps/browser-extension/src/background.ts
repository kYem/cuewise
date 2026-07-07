/**
 * Background service worker: schedules reminder wake-ups and delivers their
 * notifications through the platform Scheduler/Notifier seams.
 */

import {
  logger,
  nextReminderDueDate,
  type Reminder,
  reminderAlarmId,
  reminderIdFromAlarm,
  resolveReminderNotificationAction,
} from '@cuewise/shared';
import { getReminders, setReminders } from '@cuewise/storage';
import { configureChromePlatform } from './platform';

const { scheduler, notifier } = configureChromePlatform();

// Fire a reminder's notification when its scheduled time arrives.
scheduler.onFire((alarmId) => {
  logger.info('Alarm triggered', { alarmName: alarmId });
  const reminderId = reminderIdFromAlarm(alarmId);
  if (reminderId !== null) {
    return handleReminderAlarm(reminderId);
  }
});

async function handleReminderAlarm(reminderId: string) {
  try {
    const reminders = await getReminders();
    const reminder = reminders.find((r) => r.id === reminderId);

    if (!reminder) {
      logger.warn(`Reminder ${reminderId} not found`);
      return;
    }

    // Don't notify if already completed
    if (reminder.completed) {
      return;
    }

    // Paused recurring reminders must neither notify nor re-arm.
    if (reminder.recurring && reminder.paused) {
      return;
    }

    await notifier.notify({
      id: reminderAlarmId(reminderId),
      title: '🔔 Reminder',
      body: reminder.text,
      actions: ['Done', 'Snooze 5 min'],
      requireInteraction: true, // Notification stays until user dismisses
    });

    // Mark as notified
    const updatedReminders = reminders.map((r) =>
      r.id === reminderId ? { ...r, notified: true } : r
    );
    await setReminders(updatedReminders);

    // Handle recurring reminders (paused ones already returned above)
    if (reminder.recurring) {
      await scheduleRecurringReminder(reminder);
    }
  } catch (error) {
    logger.error('Error handling reminder alarm', error);
  }
}

/**
 * Schedule the next occurrence of a recurring reminder
 */
async function scheduleRecurringReminder(reminder: Reminder) {
  if (!reminder.recurring) {
    return;
  }

  const nextDueDate = nextReminderDueDate(reminder, new Date());

  const reminders = await getReminders();
  const updatedReminders = reminders.map((r) =>
    r.id === reminder.id
      ? { ...r, dueDate: nextDueDate.toISOString(), notified: false, completed: false }
      : r
  );
  await setReminders(updatedReminders);

  await scheduler.scheduleAt(reminderAlarmId(reminder.id), nextDueDate);
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
