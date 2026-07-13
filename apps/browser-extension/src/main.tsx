import { App, PomodoroPipProvider } from '@cuewise/app';
import '@cuewise/app/styles.css';
import { configurePlatform } from '@cuewise/shared';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeLogger } from './lib/logger-config';
import { configureChromePlatform } from './platform';
import { ChromeRuntimeSyncSink } from './sync/chrome-runtime-sync-sink';

// Initialize logger configuration based on environment
initializeLogger();

// Bind the Chrome scheduler/notifier so the stores can arm alarms and notify.
configureChromePlatform();

// ENG-45 option B: the page realm has no SyncEngine of its own (MV3 page and service
// worker are separate JS module states), so store mutations here (hideQuote, addTask,
// etc.) relay to the background over chrome.runtime messaging instead — background.ts
// is the single sync owner and marks them dirty. Same enable gate as background.ts.
const syncApiBaseUrl = import.meta.env.VITE_SYNC_API_BASE_URL;
if (syncApiBaseUrl) {
  configurePlatform({ syncSink: new ChromeRuntimeSyncSink() });
}

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
