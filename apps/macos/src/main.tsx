import { App, PomodoroPipProvider } from '@cuewise/app';
import '@cuewise/app/styles.css';
import { configurePlatform } from '@cuewise/shared';
import { LocalStorageKeyValueStore } from '@cuewise/storage';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { NoopScheduler, TauriNotifier, WebNotifier } from './platform';

// Bind the platform seams for the Tauri webview so the reused extension stores
// and helpers work unchanged: localStorage-backed storage, web notifications,
// and a no-op scheduler until the Rust core takes over background wakes.
// Native OS notifications inside the Tauri window; a no-op web fallback in the
// browser / e2e context where the Tauri IPC isn't present.
const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

configurePlatform({
  storage: new LocalStorageKeyValueStore(),
  notifier: inTauri ? new TauriNotifier() : new WebNotifier(),
  scheduler: new NoopScheduler(),
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PomodoroPipProvider>
      <App />
    </PomodoroPipProvider>
  </React.StrictMode>
);
