/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Dev-only opt-in to run the ENG-45 cloud-sync engine. Off by default — no
  // enable-sync UI ships yet, so this only self-heals/resumes a session enabled
  // some other way (e.g. devtools). Never set in production.
  readonly VITE_CLOUD_SYNC?: string;
  // Cloud-sync API origin, used only when VITE_CLOUD_SYNC is on.
  readonly VITE_SYNC_API_BASE_URL?: string;
}

// Compile-time constants injected via this app's vite `define` — also referenced
// by the shared @cuewise/app UI this app renders and type-checks.
declare const __APP_VERSION__: string;
declare const __APP_NAME__: string;
