/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Dev-only opt-in to preview the calendar companion in the Vite dev server
  // (Connect is unavailable there). Ignored in production builds.
  readonly VITE_CALENDAR_PREVIEW?: string;
  // Cloud-sync API origin. A non-empty value IS the ENG-45 enable signal — off by
  // default; when set it enables the Cloud Sync settings section and self-heals/resumes
  // a session enabled some other way (e.g. devtools). Never set in production.
  readonly VITE_SYNC_API_BASE_URL?: string;
  // Chrome-Extension OAuth client id for "Sign in with Google" (cloud sync). Unset hides the
  // Google sign-in path and disables the `identity` optional permission it needs.
  readonly VITE_GOOGLE_SYNC_CLIENT_ID?: string;
}

declare const __APP_VERSION__: string;
declare const __APP_NAME__: string;
