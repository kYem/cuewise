export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_IDS: string;
  APPLE_CLIENT_ID: string;
  PUBLIC_BASE_URL: string;
  ALLOWED_RETURN_URIS: string;
  STATE_SIGNING_KEY: string;
  DEV_FAKE_AUTH?: string;
}
