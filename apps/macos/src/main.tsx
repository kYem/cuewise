import { configurePlatform } from '@cuewise/shared';
import { LocalStorageKeyValueStore } from '@cuewise/storage';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { NoopScheduler, WebNotifier } from './platform';

// Bind the platform seams for the Tauri webview so shared stores/helpers work
// unchanged: localStorage-backed storage, web notifications, a no-op scheduler
// until the Rust core takes over background wakes.
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
    <App />
  </React.StrictMode>
);
