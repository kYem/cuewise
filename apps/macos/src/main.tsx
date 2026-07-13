import { PomodoroPipProvider } from '@cuewise/app';
import { handleReminderFire } from '@cuewise/app/reminder-notifications';
import '@cuewise/app/styles.css';
import { configurePlatform, logger } from '@cuewise/shared';
import { LocalStorageKeyValueStore } from '@cuewise/storage';
import { SYNC_PULL_WAKE_ID } from '@cuewise/sync-client';
import { createSyncEngine } from '@cuewise/sync-engine';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppWrapper } from './AppWrapper';
import { GlowOverlay } from './glow/GlowOverlay';
import { NoopScheduler, TauriNotifier, TauriScheduler, WebNotifier } from './platform';
import { initPosture } from './posture/posture-controller';
import { TrayStatusBridge } from './tray/TrayStatusBridge';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}
const root = ReactDOM.createRoot(rootElement);

// The glow windows (`glow.rs`) load this same bundle at `#glow` and must render
// ONLY the vignette — duplicating the wiring below would double-fire reminders.
if (window.location.hash === '#glow') {
  // Belt to glow-overlay.css's first-paint :target rule: force transparency via
  // inline styles too, for engines without :has() support.
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  root.render(<GlowOverlay />);
} else {
  // Platform adapters for the Tauri webview (localStorage, native notifications,
  // Rust-backed scheduler); outside Tauri (browser/e2e) fall back to web + no-op.
  const inTauri = '__TAURI_INTERNALS__' in window;

  const scheduler = inTauri ? new TauriScheduler() : new NoopScheduler();
  const storage = new LocalStorageKeyValueStore();

  configurePlatform({
    storage,
    notifier: inTauri ? new TauriNotifier() : new WebNotifier(),
    scheduler,
  });

  // The Rust core owns the timers; when one fires it emits `scheduler://fire` and
  // we deliver the reminder here (the webview stays alive behind the tray). This
  // mirrors the extension's service worker. No-op under NoopScheduler.
  scheduler.onFire(handleReminderFire);

  // ENG-45 cloud sync: off by default — no enable-sync UI ships yet. Set
  // VITE_SYNC_API_BASE_URL locally (pointed at `wrangler dev`, e.g. localhost:8787) to
  // resume/self-heal a session that was enabled some other way (e.g. devtools).
  const syncApiBaseUrl = import.meta.env.VITE_SYNC_API_BASE_URL;
  if (syncApiBaseUrl) {
    const syncEngine = createSyncEngine({
      baseUrl: syncApiBaseUrl,
      keyStore: storage,
      scheduler,
    });
    scheduler.onFire((id) => {
      if (id === SYNC_PULL_WAKE_ID) {
        syncEngine.handlePullWake();
      }
    });
    syncEngine.start().catch((error) => {
      logger.error('Sync engine failed to start', error);
    });
  }

  // Restore posture tracking if it was left on last session (macOS-only, opt-in).
  if (inTauri) {
    initPosture();
  }

  root.render(
    <React.StrictMode>
      <PomodoroPipProvider>
        {inTauri ? <TrayStatusBridge /> : null}
        <AppWrapper />
      </PomodoroPipProvider>
    </React.StrictMode>
  );
}
