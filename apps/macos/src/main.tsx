import { PomodoroPipProvider } from '@cuewise/app';
import { handleReminderFire } from '@cuewise/app/reminder-notifications';
import '@cuewise/app/styles.css';
import { configurePlatform } from '@cuewise/shared';
import { LocalStorageKeyValueStore } from '@cuewise/storage';
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
  // The app stylesheet paints opaque html/body backgrounds; inline styles beat
  // any stylesheet, keeping the transparent overlay window actually see-through.
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  root.render(<GlowOverlay />);
} else {
  // Wire the platform adapters for the Tauri webview so the reused extension
  // stores and helpers work unchanged: localStorage-backed storage, native OS
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
