/**
 * Background service worker: schedules reminder wake-ups and delivers their
 * notifications through the platform Scheduler/Notifier ports.
 */

import type { SyncUiStatus } from '@cuewise/app';
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
import { createSyncEngine, type SyncStatus } from '@cuewise/sync-engine';
import { configureChromePlatform } from './platform';
import { handleSyncControlMessage } from './sync/handle-sync-control-message';
import { handleSyncMessage } from './sync/handle-sync-message';
import { isSyncControlMessage } from './sync/sync-control-messages';

const { scheduler, notifier } = configureChromePlatform();

// Fire a reminder's notification when its scheduled time arrives. The lookup +
// deliver + recurring re-arm logic is shared with the macOS app so both platforms
// behave identically.
scheduler.onFire(handleReminderFire);

// Engine SyncStatus -> UI-facing SyncUiStatus; adapters own this mapping per host.
// Exported for unit testing.
export function mapToUi(status: SyncStatus): SyncUiStatus {
  if (status === 'disabled') {
    return 'off';
  }
  if (
    status === 'signing_in' ||
    status === 'key_init' ||
    status === 'enrolling' ||
    status === 'initial_sync'
  ) {
    return 'connecting';
  }
  if (status === 'active') {
    return 'active';
  }
  if (status === 'error') {
    return 'error';
  }
  if (status === 'signed_out') {
    return 'needs_reauth';
  }
  // Exhaustiveness guard: a new SyncStatus member is a compile error here, not a silent fallthrough.
  const exhaustive: never = status;
  throw new Error(`unmapped sync status: ${String(exhaustive)}`);
}

// ENG-45 cloud sync: off by default. Set VITE_SYNC_API_BASE_URL locally (pointed at
// `wrangler dev`, e.g. localhost:8787) to enable the Cloud Sync settings section and
// resume/self-heal a session that was enabled some other way (e.g. devtools).
const syncApiBaseUrl = import.meta.env.VITE_SYNC_API_BASE_URL;
if (syncApiBaseUrl) {
  // One-shot capture slot (E4): the control handler reads-and-clears it via takeRecoveryCode.
  // NEVER persisted or logged — the code only ever leaves this module in a control response.
  let capturedRecoveryCode: string | undefined;

  const syncEngine = createSyncEngine({
    baseUrl: syncApiBaseUrl,
    keyStore: getStorage(),
    scheduler,
    onStatus: (status) => {
      chrome.storage.local
        .set({ 'cuewise.sync.status': mapToUi(status) })
        .catch((error) => logger.error('Failed to persist sync status', error));
    },
    onQuarantine: () => {
      chrome.storage.local
        .set({ 'cuewise.sync.lastQuarantineAt': Date.now() })
        .catch((error) => logger.error('Failed to persist sync quarantine timestamp', error));
    },
    onRecoveryCode: (code) => {
      capturedRecoveryCode = code;
    },
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

  // ENG-45 Task 10: the page-realm enable-sync UI control channel. Ignores non-control
  // messages (the mutation listener above handles those) and holds the channel open.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!isSyncControlMessage(msg)) {
      return false;
    }
    handleSyncControlMessage(syncEngine, msg, {
      takeRecoveryCode: () => {
        const code = capturedRecoveryCode;
        capturedRecoveryCode = undefined;
        return code;
      },
    })
      .then(sendResponse)
      .catch((error) => {
        // Always close the message port, even on an unexpected handler rejection.
        logger.error('Sync control handler failed', error);
        try {
          sendResponse({ ok: false, reason: 'error' });
        } catch (sendError) {
          // The requesting page's port may already be torn down — expected, not an error.
          logger.debug('Sync control sendResponse failed on a torn-down port', {
            error: sendError,
          });
        }
      });
    return true;
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
