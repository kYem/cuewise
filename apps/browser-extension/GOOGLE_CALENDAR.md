# Google Calendar integration — setup

The Pomodoro page can show an **Up next** strip pulled live from the user's
Google Calendar. It is read-only (`calendar.readonly`), entirely client-side —
the extension talks to Google directly via `chrome.identity.getAuthToken`, and
no Cuewise backend ever sees calendar data.

The feature is safe to ship un-configured: in development the strip shows sample
data, and a production build without an OAuth client id reports that the
calendar isn't set up rather than connecting.

The steps below mint the OAuth client and are done **once by a maintainer** in
the Google Cloud console — Claude does not perform credential steps.

## 1. Enable the Calendar API

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select
   (or create) the project used for Cuewise.
2. **APIs & Services → Library → Google Calendar API → Enable**.

## 2. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External**.
3. Add the scope `https://www.googleapis.com/auth/calendar.readonly`.
4. While the app is in **Testing**, add each tester's Google account under
   *Test users* (refresh tokens for test apps expire after 7 days — publish to
   **In production** to remove that limit).

## 3. Create the Chrome-Extension OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Chrome Extension**.
3. **Item ID**: the extension's ID.
   - Published build: the stable Web Store ID (`CHROME_EXTENSION_ID` in
     `.env.chrome`).
   - Local unpacked build: the ID Chrome assigns on load. This changes per
     machine unless you pin it — see *Stable local ID* below.
4. Copy the generated **Client ID** (looks like
   `1234567890-abc...xyz.apps.googleusercontent.com`).

## 4. Wire it into the build

Add the client id to `apps/browser-extension/.env` (gitignored; copy from
`.env.example`):

```
VITE_GOOGLE_OAUTH_CLIENT_ID=1234567890-...apps.googleusercontent.com
```

`manifest.config.ts` reads this at build time into the manifest `oauth2` block.
Rebuild (`pnpm --filter @cuewise/browser-extension build`) and load
`apps/browser-extension/dist` as an unpacked extension. The OAuth client id is
public (it ships in the manifest), so it does not need to be kept secret.

## Stable local ID (for testing real OAuth before publishing)

A Chrome-Extension OAuth client is bound to one extension ID, so an unpacked
build needs a fixed ID that matches the registered client. This is a manual
step — the committed `manifest.config.ts` has no `key` field. To pin the ID, add
a `key` (the extension's public key) to the generated manifest; Chrome then
derives the same ID every load. Use the published item's key, or generate a
keypair and register that ID with the OAuth client. Do **not** commit the key —
inject it from the build env alongside the client id.

## Verifying

In the installed extension, open the Pomodoro page, set the companion to
**Calendar** (or **Both**) in Settings, and click **Connect Google Calendar**.
The first connect prompts for consent; refreshing afterward is silent (it
reuses Chrome's cached token — nothing fetches a token on page load). The dev
server (`pnpm dev`) has no `chrome.identity`, so it always shows sample data.
