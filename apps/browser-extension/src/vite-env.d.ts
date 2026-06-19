/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Dev-only opt-in to preview the calendar companion in the Vite dev server
  // (Connect is unavailable there). Ignored in production builds.
  readonly VITE_CALENDAR_PREVIEW?: string;
}

declare const __APP_VERSION__: string;
declare const __APP_NAME__: string;
