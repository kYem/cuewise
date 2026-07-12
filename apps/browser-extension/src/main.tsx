import { App, PomodoroPipProvider } from '@cuewise/app';
import '@cuewise/app/styles.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeLogger } from './lib/logger-config';
import { configureChromePlatform } from './platform';

// Initialize logger configuration based on environment
initializeLogger();

// Bind the Chrome scheduler/notifier so the stores can arm alarms and notify.
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
