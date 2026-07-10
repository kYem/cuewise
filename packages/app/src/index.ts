// Public surface of the shared Cuewise application: the routed app shell and the
// Pomodoro pop-out provider that every platform (extension, macOS, future web)
// mounts. Platform wiring (storage/scheduler/notifier) is supplied by the host
// via @cuewise/shared's configurePlatform before rendering.
export { default as App } from './App';
export { PomodoroPipProvider } from './components/PomodoroPipProvider';

// Store + selector surface for platform hosts that project state outside the app
// tree (e.g. the macOS menu-bar tray).
export { usePomodoroStore } from './stores/pomodoro-store';
export { useReminderStore } from './stores/reminder-store';
export type { SessionType } from './utils/pomodoro-styles';
export { getSessionLabel } from './utils/pomodoro-styles';
