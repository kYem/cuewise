/**
 * Background Service Worker for handling alarms and notifications
 */

import { logger, type Reminder } from '@cuewise/shared';
import { getReminders, setReminders } from '@cuewise/storage';

/**
 * Set up declarativeNetRequest rules for YouTube iframe embedding
 * Chrome extensions don't send Referer headers with iframes, causing YouTube Error 153
 * This workaround sets the Referer header using declarativeNetRequest
 * See: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/OUJad0q-d_g
 */
chrome.runtime.onInstalled.addListener(() => {
  const YOUTUBE_REFERER_RULE: chrome.declarativeNetRequest.Rule = {
    id: 1,
    condition: {
      initiatorDomains: [chrome.runtime.id],
      requestDomains: ['www.youtube.com', 'www.youtube-nocookie.com'],
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.SUB_FRAME],
    },
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
      requestHeaders: [
        {
          header: 'Referer',
          value: `https://${chrome.runtime.id}.chromiumapp.org/`,
          operation: chrome.declarativeNetRequest.HeaderOperation.SET,
        },
      ],
    },
  };

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [YOUTUBE_REFERER_RULE.id],
    addRules: [YOUTUBE_REFERER_RULE],
  });

  logger.info('YouTube Referer header rule installed');
});

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

    // Show notification with custom icon
    await chrome.notifications.create(`reminder-${reminderId}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: '🔔 Reminder',
      message: reminder.text,
      priority: 2,
      requireInteraction: true, // Notification stays until user dismisses
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
  if (!reminder.recurring) return;

  const currentDueDate = new Date(reminder.dueDate);
  let nextDueDate: Date;

  switch (reminder.recurring.frequency) {
    case 'daily':
      nextDueDate = new Date(currentDueDate.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
      nextDueDate = new Date(currentDueDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      nextDueDate = new Date(currentDueDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      break;
    default:
      return;
  }

  // Update reminder with new due date
  const reminders = await getReminders();
  const updatedReminders = reminders.map((r) =>
    r.id === reminder.id
      ? {
          ...r,
          dueDate: nextDueDate.toISOString(),
          notified: false,
          completed: false,
        }
      : r
  );

  await setReminders(updatedReminders);

  // Schedule next alarm
  await chrome.alarms.create(`reminder-${reminder.id}`, {
    when: nextDueDate.getTime(),
  });
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
 * Handle notification button clicks (mark as complete)
 */
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId.startsWith('reminder-') && buttonIndex === 0) {
    const reminderId = notificationId.replace('reminder-', '');

    // Mark reminder as completed
    const reminders = await getReminders();
    const updatedReminders = reminders.map((r) =>
      r.id === reminderId ? { ...r, completed: true } : r
    );
    await setReminders(updatedReminders);

    // Clear the notification
    await chrome.notifications.clear(notificationId);
  }
});
