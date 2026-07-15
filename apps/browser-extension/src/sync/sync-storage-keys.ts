// Raw chrome.storage.local keys carrying sync state from the background service worker to the page
// realm: background.ts writes status/quarantine, BridgeSyncController reads them. Single source so
// the SW writer and the page reader can't drift. (CLOUD_SYNC_ENABLED_KEY is the engine's own key,
// exported from @cuewise/sync-engine.)
export const STATUS_KEY = 'cuewise.sync.status';
export const QUARANTINE_KEY = 'cuewise.sync.lastQuarantineAt';

/** Persisted { accountId, deviceName } for dev-path reconnect — the bridge writes and reads it. */
export const LAST_SYNC_CREDS_KEY = 'cuewise.sync.lastCreds';
