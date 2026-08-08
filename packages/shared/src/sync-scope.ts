// Settings keys that must never leave the device — synced toggles would let devices fight over
// on/off (spec §2); the rest are per-device state, not shared prefs: window chrome like the
// notes pin would pop pads open on other devices mid-session if it synced.
export const DEVICE_LOCAL_SETTINGS_KEYS: readonly string[] = [
  'syncEnabled',
  'cloudSyncEnabled',
  'logLevel',
  'focusedGoalId',
  'hasSeenOnboarding',
  'notesExpanded',
  'notesPinned',
];
