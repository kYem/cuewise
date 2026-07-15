import type { SyncController } from '@cuewise/app';
import { App, PomodoroPipProvider, useToastStore } from '@cuewise/app';
import '@cuewise/app/styles.css';
import { configurePlatform } from '@cuewise/shared';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeLogger } from './lib/logger-config';
import { configureChromePlatform } from './platform';
import { BridgeSyncController } from './sync/bridge-sync-controller';
import { ChromeRuntimeSyncSink } from './sync/chrome-runtime-sync-sink';

// Initialize logger configuration based on environment
initializeLogger();

// Bind the Chrome scheduler/notifier so the stores can arm alarms and notify.
configureChromePlatform();

// ENG-45 option B: the page realm has no SyncEngine of its own (MV3 page and service
// worker are separate JS module states), so store mutations here (hideQuote, addTask,
// etc.) relay to the background over chrome.runtime messaging instead — background.ts
// is the single sync owner and marks them dirty. Same base-URL dev flag as background.ts, but
// the page realm additionally requires the extension APIs to be present (see hasExtensionApis).
const syncApiBaseUrl = import.meta.env.VITE_SYNC_API_BASE_URL;
// The bridge relays mutations + control ops to the service worker over chrome.runtime and
// hydrates status from chrome.storage. Outside an extension page (e.g. the localhost dev
// server) those APIs are absent — wiring it there throws in the constructor and blanks the
// whole app, and there's no service worker to relay to anyway. chrome.storage.local is the
// decisive signal: a plain web page never has it.
const hasExtensionApis = typeof chrome !== 'undefined' && chrome.storage?.local !== undefined;
let syncController: SyncController | undefined;
if (syncApiBaseUrl && hasExtensionApis) {
  configurePlatform({ syncSink: new ChromeRuntimeSyncSink() });
  // Task 11: the enable-sync UI's control seam, relaying to the SW's handleSyncControlMessage.
  syncController = new BridgeSyncController({
    toast: (message) => useToastStore.getState().warning(message),
    googleClientId: import.meta.env.VITE_GOOGLE_SYNC_CLIENT_ID,
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <PomodoroPipProvider>
      <App syncController={syncController} />
    </PomodoroPipProvider>
  </React.StrictMode>
);
