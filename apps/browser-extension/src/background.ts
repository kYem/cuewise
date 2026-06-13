/**
 * Background Service Worker for handling alarms and notifications
 */

import { logger, nextReminderDueDate, type Reminder } from '@cuewise/shared';
import { getReminders, setReminders } from '@cuewise/storage';

// Listen for alarm triggers
chrome.alarms.onAlarm.addListener(async (alarm) => {
  logger.info('Alarm triggered', { alarmName: alarm.name });

  // Check if this is a reminder alarm
  if (alarm.name.startsWith('reminder-')) {
    const reminderId = alarm.name.replace('reminder-', '');
    await handleReminderAlarm(reminderId);
  }
});

/**
 * Handle reminder alarm by showing notification
 */
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
    if (reminder.recurring && reminder.recurring.enabled === false) {
      return;
    }

    // Show notification with custom icon
    await chrome.notifications.create(`reminder-${reminderId}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: '🔔 Reminder',
      message: reminder.text,
      priority: 2,
      requireInteraction: true, // Notification stays until user dismisses
      buttons: [{ title: 'Done' }, { title: 'Snooze 5 min' }],
    });

    // Mark as notified
    const updatedReminders = reminders.map((r) =>
      r.id === reminderId ? { ...r, notified: true } : r
    );
    await setReminders(updatedReminders);

    // Handle recurring reminders
    if (reminder.recurring?.enabled) {
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

  await chrome.alarms.create(`reminder-${reminder.id}`, { when: nextDueDate.getTime() });
}

/**
 * Handle notification clicks - open the extension
 */
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith('reminder-')) {
    // Clear the notification
    await chrome.notifications.clear(notificationId);

    // Open the new tab page (where our extension lives)
    const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('index.html') });

    if (tabs.length > 0 && tabs[0].id) {
      // Focus existing tab
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId || 0, { focused: true });
    } else {
      // Create new tab
      await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    }
  }
});

/**
 * Handle notification button clicks (Done / Snooze 5 min)
 */
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (!notificationId.startsWith('reminder-')) {
    return;
  }
  const reminderId = notificationId.replace('reminder-', '');
  const reminders = await getReminders();

  if (buttonIndex === 0) {
    // Done: only mark one-off reminders complete. Any recurring reminder
    // (active OR paused) is just dismissed — an active one was already advanced
    // on fire, and a paused one must not be permanently completed.
    const reminder = reminders.find((r) => r.id === reminderId);
    if (!reminder?.recurring) {
      const updated = reminders.map((r) => (r.id === reminderId ? { ...r, completed: true } : r));
      await setReminders(updated);
    }
  } else if (buttonIndex === 1) {
    // Don't resurrect a recurring reminder paused while the notification lingered
    const reminder = reminders.find((r) => r.id === reminderId);
    if (reminder?.recurring && reminder.recurring.enabled === false) {
      await chrome.notifications.clear(notificationId);
      return;
    }
    // Snooze 5 min: pull the next alarm in to 5 minutes from now
    const snoozeAt = Date.now() + 5 * 60_000;
    const updated = reminders.map((r) =>
      r.id === reminderId
        ? { ...r, dueDate: new Date(snoozeAt).toISOString(), notified: false, completed: false }
        : r
    );
    await setReminders(updated);
    await chrome.alarms.create(`reminder-${reminderId}`, { when: snoozeAt });
  }

  await chrome.notifications.clear(notificationId);
});
