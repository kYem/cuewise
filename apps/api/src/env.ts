export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_IDS: string;
  // The client the Google server-bounce authenticates as; must also appear in
  // GOOGLE_CLIENT_IDS (the bounced id_token carries it as `aud`).
  GOOGLE_OAUTH_CLIENT_ID: string;
  // Secret (wrangler secret put), never a plaintext var — pairs with GOOGLE_OAUTH_CLIENT_ID.
  GOOGLE_CLIENT_SECRET: string;
  APPLE_CLIENT_ID: string;
  PUBLIC_BASE_URL: string;
  ALLOWED_RETURN_URIS: string;
  STATE_SIGNING_KEY: string;
  DEV_FAKE_AUTH?: string;
  // Comma-separated browser origins allowed CORS access (e.g. the future web app).
  // Empty in production by default; localhost is auto-allowed only under DEV_FAKE_AUTH.
  ALLOWED_ORIGINS?: string;
}
