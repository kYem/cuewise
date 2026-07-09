// Public surface of the shared Cuewise application: the routed app shell and the
// Pomodoro pop-out provider that every platform (extension, macOS, future web)
// mounts. Platform wiring (storage/scheduler/notifier) is supplied by the host
// via @cuewise/shared's configurePlatform before rendering.
export { default as App } from './App';
export { PomodoroPipProvider } from './components/PomodoroPipProvider';
