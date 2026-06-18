# Google Calendar integration — setup

The Pomodoro page can show an **Up next** strip pulled live from the user's
Google Calendar. It is read-only (`calendar.readonly`), entirely client-side —
the extension talks to Google directly via `chrome.identity.getAuthToken`, and
no Cuewise backend ever sees calendar data.

The feature is safe to ship un-configured: a production build without an OAuth
client id hides the companion entirely, and the strip never shows sample or
preview data — only the Connect prompt until a real connection succeeds.

## Permissions are opt-in

`identity` and the Google API hosts (`googleapis.com`, `oauth2.googleapis.com`)
are declared as **optional** permissions, not install-time ones. They're
requested at runtime when the user clicks **Connect Google Calendar** and
released again on disconnect, so a user who never enables the calendar installs
with only its base permissions (`storage`, `notifications`, `alarms`, `favicon`)
— nothing Google-related. The `oauth2` block and the CSP `connect-src` entries
are static manifest config (CSP can't vary per user), not user-facing grants.

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

> **This is a *separate* OAuth client from the one used to publish to the Chrome
> Web Store.** Don't reuse the publishing credentials (`CHROME_CLIENT_ID` /
> `CHROME_CLIENT_SECRET` in `.env.chrome`). That one is a **Web application**
> client (it has a client *secret* and a registered redirect URI, and uses the
> `chromewebstore` scope). `chrome.identity.getAuthToken` requires a **Chrome
> Extension** client — no secret, bound to the extension ID — and Google rejects
> a Web-application client id here. Create this new client in the **same Google
> Cloud project** (reusing the consent screen above); the two clients sit side by
> side in the project's Credentials list.

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
build needs a fixed ID that matches the registered client. The recommended
setup is a **single** OAuth client bound to the Web Store Item ID, with the
local build pinned to that same ID — one identity to verify, and dev mirrors
production exactly.

`manifest.config.ts` reads a `key` from `VITE_EXTENSION_KEY` and injects it into
the manifest when set; Chrome then derives the same ID every load. Set it only in
your local `.env` — leave it unset for the release build so the published
manifest omits `key` (the Web Store manages the published ID):

```
VITE_EXTENSION_KEY=<base64 public key of the Web Store item>
```

The `key` is the extension's **public** key (not secret), but it's still kept
out of git and the release build so contributors' local builds don't all
masquerade as the production ID and the CWS package isn't shipped with a
redundant key.

**Getting the value for an already-published item:** the public key Chrome
recorded for the installed Web Store extension lives in your Chrome profile's
`Secure Preferences` under
`extensions.settings.<extension-id>.manifest.key`. Copy that base64 string into
`VITE_EXTENSION_KEY`. (Alternatively, extract the SubjectPublicKeyInfo from the
item's `.crx` header.)

The escape hatch — only if pinning the production key isn't workable (e.g. many
developers with their own unpacked IDs): generate a keypair, set its public key
as `VITE_EXTENSION_KEY`, and register that ID as a **separate** dev OAuth client
kept in Testing. Extra upkeep, and that client stays unverified — avoid unless
needed.

## Verifying (locally)

In the installed extension, open the Pomodoro page, set the companion to
**Calendar** (or **Both**) in Settings, and click **Connect Google Calendar**.
The first connect prompts to grant the optional permission, then for Google
consent; refreshing afterward is silent (it reuses Chrome's cached token —
nothing fetches a token on page load). Disconnecting revokes the token and
removes the optional permission, so a follow-up connect prompts again. The dev
server (`pnpm dev`) has no `chrome.identity`, so Connect reports the calendar
isn't available there — there is no sample data to preview.

## Publishing & sensitive-scope verification

`calendar.readonly` is a **Sensitive** scope (not **Restricted**). That means
Google approves it through the standard OAuth app verification — brand review +
scope justification + a demo video — and it does **not** require the annual
third-party security assessment (CASA) that restricted scopes (full Gmail/Drive)
do. Reading only the primary calendar, read-only, keeps us on the lighter path.

### Two publish modes (OAuth consent screen → Publishing status)

| | **Testing** | **In production (verified)** |
| --- | --- | --- |
| Google review | none | required (sensitive scope) |
| Audience | ≤100 named *Test users* | unlimited |
| Consent screen | "Google hasn't verified this app" warning | clean |
| Token lifetime | test refresh tokens expire after 7 days | normal |

The 7-day test-token expiry is largely invisible here: `getAuthToken` re-mints
silently and `fetchTodayEvents` evicts a stale token and retries on a 401
(`google-calendar.ts`), so refreshes self-heal.

### Verification flow (to go production)

1. **Verify the domain** (`cuewise.app`) in Google Search Console and add it to
   the consent screen's *Authorized domains*.
2. **Privacy policy URL** disclosing the Google data use + Limited Use — already
   written (`apps/website/src/pages/privacy.astro`, "Google Calendar
   Integration" card; it states access is client-side, read-only, and revocable).
3. **Scope justification** for `calendar.readonly` (consent screen's "How will
   the scopes be used?").
4. **Demo video** (unlisted YouTube) showing the OAuth consent screen with the
   exact scope and how the data is used in-product. This is the one artifact not
   yet produced.
5. Submit and respond to any reviewer follow-ups. Sensitive-scope review is
   typically days to a couple of weeks.

Verification lives on the **consent screen / project**, so it covers the
Chrome-Extension OAuth client automatically — no per-client step, and the
extension itself doesn't change when the status flips to production.

### Recommended sequence

Ship in **Testing** to a small beta (≤100 test users) now — no review needed —
while verifying the domain and recording the demo video in parallel. Flip the
consent screen to **In production** once approved; the client id, manifest, and
extension code stay identical.
