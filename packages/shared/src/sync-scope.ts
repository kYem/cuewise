// Settings keys that must never leave the device — synced toggles would let devices fight over
// on/off (spec §2), and the rest is per-device state: a synced notes pin pops pads open elsewhere.
export const DEVICE_LOCAL_SETTINGS_KEYS: readonly string[] = [
  'syncEnabled',
  'cloudSyncEnabled',
  'logLevel',
  'focusedGoalId',
  'hasSeenOnboarding',
  'notesExpanded',
  'notesPinned',
];
