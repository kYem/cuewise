import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/poppins/600.css';
import '@cuewise/app/styles.css';
import { useSettingsStore } from '@cuewise/app/settings-store';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeLogger } from '../lib/logger-config';
import { configureChromePlatform } from '../platform';
import { CapturePopup } from './CapturePopup';

initializeLogger();
configureChromePlatform();

// Read-only: initialize applies the user's theme, colour theme and density to this document.
void useSettingsStore.getState().initialize();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <CapturePopup />
  </React.StrictMode>
);
