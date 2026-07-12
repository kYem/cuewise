/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Dev-only opt-in to preview the calendar companion in the Vite dev server
  // (Connect is unavailable there). Ignored in production builds.
  readonly VITE_CALENDAR_PREVIEW?: string;
  // Overrides the youtube-player embed/postMessage origin (default https://cuewise.app).
  // ENG-48: lets a local player build verify each client's CSP before deploying.
  readonly VITE_PLAYER_ORIGIN?: string;
}

// Compile-time constants each host app injects via its vite `define`.
declare const __APP_VERSION__: string;
declare const __APP_NAME__: string;
