/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Cloud-sync API origin. A non-empty value IS the ENG-45 enable signal — off by
  // default; when set it enables the Cloud Sync settings section and self-heals/resumes
  // a session enabled some other way (e.g. devtools). Never set in production.
  readonly VITE_SYNC_API_BASE_URL?: string;
}

// Compile-time constants injected via this app's vite `define` — also referenced
// by the shared @cuewise/app UI this app renders and type-checks.
declare const __APP_VERSION__: string;
declare const __APP_NAME__: string;
