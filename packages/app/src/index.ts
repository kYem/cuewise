// Public surface of the shared Cuewise application: the routed app shell and the
// Pomodoro pop-out provider that every platform (extension, macOS, future web)
// mounts. Platform wiring (storage/scheduler/notifier) is supplied by the host
// via @cuewise/shared's configurePlatform before rendering.
export { default as App } from './App';
export { PomodoroPipProvider } from './components/PomodoroPipProvider';

// Settings-section kit for hosts that inject a platform-specific section into the
// shared Settings modal (e.g. the macOS "Posture" section).
export {
  Segmented,
  SettingDivider,
  SettingRow,
  SettingSubgroup,
  Switch,
} from './components/settings/SettingControls';
export type { SettingsSection } from './components/settings/SettingsSections';
export type { SettingsSectionProps } from './components/settings/settings-types';
// Store + selector surface for platform hosts that project state outside the app
// tree (e.g. the macOS menu-bar tray).
export { useFocusModeStore } from './stores/focus-mode-store';
export { usePomodoroStore } from './stores/pomodoro-store';
export { useReminderStore } from './stores/reminder-store';
export { useSettingsStore } from './stores/settings-store';
export { useToastStore } from './stores/toast-store';
// Sync seam: platform-agnostic controller interface + context the enable-sync UI
// drives; host adapters (macOS/extension) implement SyncController and provide it.
export type {
  EnableResult,
  SyncController,
  SyncDetails,
  SyncUiStatus,
} from './sync/sync-controller';
export {
  AUTH_CANCELLED_DETAIL,
  SyncControllerContext,
  useSyncController,
} from './sync/sync-controller';
export type { SessionType } from './utils/pomodoro-styles';
export { getSessionLabel } from './utils/pomodoro-styles';
