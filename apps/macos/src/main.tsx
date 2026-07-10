import { App, PomodoroPipProvider } from '@cuewise/app';
import { handleReminderFire } from '@cuewise/app/reminder-notifications';
import '@cuewise/app/styles.css';
import { configurePlatform } from '@cuewise/shared';
import { LocalStorageKeyValueStore } from '@cuewise/storage';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { NoopScheduler, TauriNotifier, TauriScheduler, WebNotifier } from './platform';
import { TrayStatusBridge } from './tray/TrayStatusBridge';

// Bind the platform seams for the Tauri webview so the reused extension stores
// and helpers work unchanged: localStorage-backed storage, native OS
// notifications, and the Rust-backed scheduler that fires wakes while hidden.
// Outside Tauri (browser / e2e) fall back to web notifications and a no-op
// scheduler, so the stores lean on their in-page poll instead.
const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const scheduler = inTauri ? new TauriScheduler() : new NoopScheduler();

configurePlatform({
  storage: new LocalStorageKeyValueStore(),
  notifier: inTauri ? new TauriNotifier() : new WebNotifier(),
  scheduler,
});

// The Rust core owns the timers; when one fires it emits `scheduler://fire` and
// we deliver the reminder here (the webview stays alive behind the tray). This
// mirrors the extension's service worker. No-op under NoopScheduler.
scheduler.onFire(handleReminderFire);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PomodoroPipProvider>
      {inTauri ? <TrayStatusBridge /> : null}
      <App />
    </PomodoroPipProvider>
  </React.StrictMode>
);
