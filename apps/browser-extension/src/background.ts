/**
 * Background service worker: schedules reminder wake-ups and delivers their
 * notifications through the platform Scheduler/Notifier ports.
 */

import type { SyncUiStatus } from '@cuewise/app';
import { recordReminderActivity } from '@cuewise/app/reminder-activity';
import {
  armMissingReminderAlarms,
  handleReminderFire,
  respondToReminder,
} from '@cuewise/app/reminder-notifications';
import { describeThrown, getStorage, logger, reminderIdFromAlarm } from '@cuewise/shared';
import { ensureSettingsMigrated, getReminders } from '@cuewise/storage';
import { SYNC_PULL_WAKE_ID } from '@cuewise/sync-client';
import { createSyncEngine, type SyncStatus } from '@cuewise/sync-engine';
import {
  handleCaptureMenuClick,
  registerCaptureMenus,
  saveCapture,
} from './capture/capture-handler';
import { isCaptureSaveMessage } from './capture/capture-messages';
import { configureChromePlatform } from './platform';
import { handleSyncControlMessage } from './sync/handle-sync-control-message';
import { handleSyncMessage } from './sync/handle-sync-message';
import { isSyncControlMessage } from './sync/sync-control-messages';
import { QUARANTINE_KEY, STATUS_KEY } from './sync/sync-storage-keys';

const { scheduler, notifier } = configureChromePlatform();

// Chrome drops a one-shot alarm before dispatching it, so a fire in flight is absent from
// chrome.alarms.getAll(); the reconcile below must see it as armed.
const firing = new Set<string>();
scheduler.onFire(async (id) => {
  firing.add(id);
  try {
    await handleReminderFire(id);
  } finally {
    firing.delete(id);
  }
});

// Chrome clears alarms on every extension update and does not guarantee them across a browser
// restart. Only the missing ones: re-creating a listed wake that fires meanwhile fires it twice.
async function reconcileReminderAlarms(): Promise<void> {
  try {
    const alarms = await chrome.alarms.getAll();
    const armed = new Set([...alarms.map((alarm) => alarm.name), ...firing]);
    await armMissingReminderAlarms(await getReminders(), armed);
  } catch (error) {
    logger.error('Could not reconcile reminder alarms on start', error);
    await recordReminderActivity({
      event: 'failed',
      detail: `reconcile: ${describeThrown(error)}`,
    });
  }
}
// An update applied at launch fires both events; two reconciles would each re-arm the same wake.
let reconciling: Promise<void> | null = null;
function reconcileOnce(): Promise<void> {
  if (reconciling === null) {
    reconciling = reconcileReminderAlarms().finally(() => {
      reconciling = null;
    });
  }
  return reconciling;
}
chrome.runtime.onInstalled.addListener(reconcileOnce);
chrome.runtime.onStartup.addListener(reconcileOnce);

chrome.runtime.onInstalled.addListener(registerCaptureMenus);
chrome.contextMenus.onClicked.addListener(handleCaptureMenuClick);
// Unconditional, unlike the sync listeners below: capture works whether or not sync is configured.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!isCaptureSaveMessage(msg)) {
    return false;
  }
  saveCapture(msg.draft)
    .then(sendResponse)
    .catch((error: unknown) => {
      // The popup closes on save and can be dismissed mid-write, so its port is often already
      // gone by the time the reply lands. The write itself has finished either way.
      logger.debug('Could not answer a capture save', { error });
    });
  return true;
});

// Uninstall feedback (spec 2026-07-17): ask departing users why. Only the
// extension version rides the URL — no user data.
const uninstallUrl = `https://cuewise.app/uninstall/?v=${chrome.runtime.getManifest().version}`;
chrome.runtime.setUninstallURL(uninstallUrl).catch((error: unknown) => {
  logger.warn('Failed to set uninstall URL', { error });
});

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
  if (status === 'needs_enroll') {
    return 'needs_enroll';
  }
  // Exhaustiveness guard: a new SyncStatus member is a compile error here, not a silent fallthrough.
  const exhaustive: never = status;
  throw new Error(`unmapped sync status: ${String(exhaustive)}`);
}

// A data migration, not a sync concern: this realm runs it whether or not sync is configured.
// Settles rather than rejects, so a failed migration delays the sync start below instead of
// cancelling it — every storage helper retries the migration on its own anyway.
const settingsMigrated = ensureSettingsMigrated().catch((error: unknown) => {
  logger.error('Failed to migrate legacy settings', error);
});

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
        .set({ [STATUS_KEY]: mapToUi(status) })
        .catch((error) => logger.error('Failed to persist sync status', error));
    },
    onQuarantine: () => {
      chrome.storage.local
        .set({ [QUARANTINE_KEY]: Date.now() })
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
  // start() checks the data key and runs the first pull, so it's the one call that must not
  // touch storage before migration — scheduler.onFire above and the onMessage listeners below
  // stay synchronous and never wait on it.
  settingsMigrated
    .then(() => syncEngine.start())
    .catch((error) => {
      logger.error('Sync engine failed to start', error);
    });

  // ENG-45 option B: the page realm relays its store mutations here (this
  // service-worker realm is the single sync owner) instead of holding its own
  // SyncEngine. Writes made in this realm itself (captures, notification Done counts) reach the
  // SW's own sink, which createSyncEngine registered.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const ack = handleSyncMessage(syncEngine, msg);
    if (ack === undefined) {
      return false;
    }
    ack.then(sendResponse).catch((error: unknown) => {
      // The tab closed before the reply, so there is no one left to retry it.
      logger.debug('Could not answer a sync mutation on a torn-down port', { error });
    });
    return true;
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

// Notification action buttons (Done / Snooze 5 min), answered exactly as the in-app card answers.
notifier.onAction(async (notificationId, buttonIndex) => {
  const reminderId = reminderIdFromAlarm(notificationId);
  if (reminderId === null) {
    return;
  }
  await respondToReminder(reminderId, buttonIndex);
});
