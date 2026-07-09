import { configurePlatform } from '@cuewise/shared';
import { LocalStorageKeyValueStore } from '@cuewise/storage';
import App from '@ext/App';
import { PomodoroPipProvider } from '@ext/components/PomodoroPipProvider';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { NoopScheduler, WebNotifier } from './platform';

// Bind the platform seams for the Tauri webview so the reused extension stores
// and helpers work unchanged: localStorage-backed storage, web notifications,
// and a no-op scheduler until the Rust core takes over background wakes.
configurePlatform({
  storage: new LocalStorageKeyValueStore(),
  notifier: new WebNotifier(),
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
