import { App, PomodoroPipProvider } from '@cuewise/app';
import '@cuewise/app/styles.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeLogger } from './lib/logger-config';
import { configureChromePlatform } from './platform';

// Initialize logger configuration based on environment
initializeLogger();

// Bind the Chrome scheduler/notifier so the stores can arm alarms and notify.
// TODO(ENG-45): page realm has no sync sink — createSyncEngine only runs in background.ts,
// and MV3 page/service-worker are separate realms, so mutations here (hideQuote, addTask,
// etc.) never get marked dirty for push (pull still works via the background loop). Before
// enable-sync UI ships: (a) register a markMutated-only sink here — safe since dirty
// metadata lives in shared chrome.storage.local, only the pull/push network loop needs a
// single owner (background) — or (b) relay mutations via chrome.runtime.sendMessage.
configureChromePlatform();

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
