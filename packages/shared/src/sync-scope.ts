// Settings keys that must never leave the device — synced toggles would let devices fight over
// on/off (spec §2); logLevel/focusedGoalId/hasSeenOnboarding are per-device state, not shared prefs.
export const DEVICE_LOCAL_SETTINGS_KEYS: readonly string[] = [
  'syncEnabled',
  'cloudSyncEnabled',
  'logLevel',
  'focusedGoalId',
  'hasSeenOnboarding',
];
