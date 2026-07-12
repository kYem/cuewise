# CLAUDE.md - Cloud Sync API (apps/api)

AI-assistant guide for the ENG-43 cloud-sync backend. Read the root [`CLAUDE.md`](../../CLAUDE.md) first for monorepo-wide conventions — this file only covers what's specific to this package.

## What This Is

`apps/api` is Cuewise's **opt-in** cloud-sync backend: a Cloudflare Worker (Hono) with a D1 (SQLite) database, deployed independently of the marketing site and the extension. It lets a signed-in user sync goals/quotes/reminders/etc. across the Chrome extension, the Tauri macOS app, and future web/mobile clients.

**The one guardrail that shapes everything below**: the server stores **ciphertext only**. It never parses, indexes, decrypts, or logs a record's payload — `ciphertext` is an opaque string all the way through `validate-changes.ts`, `d1-store.ts`, and the `records` table. (The real encryption envelope is ENG-44's deliverable; until it lands, callers pass a stub plaintext envelope through the same opaque field — the server code is identical either way.) This is why there's no server-side search or analytics on record contents, and why `GET /export` / `DELETE /account` exist from v1 — they're the privacy exit hatch a ciphertext-only server owes its users.

Stack: Hono (routing) + D1 (`DB` binding) + `jose` (JWT/JWKS verification for Google/Apple ID tokens) + Vitest via `@cloudflare/vitest-pool-workers` (tests run inside a real Workers runtime, not a Node shim).

## Architecture

```
worker entry (src/worker.ts) — fetch + scheduled() tombstone-purge cron
  → Hono app (src/index.ts)
      → app.use(...) middleware — auth, rate limiting (order-sensitive, see Gotchas)
      → route handlers (src/routes/*.ts)
          → SyncStore interface (src/store.ts)
              → D1SyncStore adapter (src/d1-store.ts) → D1 binding (`DB`)
```

`wrangler.jsonc` `main` is `src/worker.ts` (the Cloudflare entry: the app's `fetch` plus the cron `scheduled()`); `index.ts` stays the Hono app so tests drive it directly via `app.request`.

This mirrors the repo's ports/adapters pattern (`packages/shared/src/platform/`): `SyncStore` is the port, `D1SyncStore` is the one adapter today. A future non-D1 backend only needs a new adapter — routes and validation stay unaware D1 exists.

Auth has two shapes. **Session lookup** has no dedicated port: `requireSession()` (`auth-middleware.ts`) resolves `Authorization: Bearer <token>` → `{userId, tokenHash}` context vars, but does so through the `SyncStore` port's `lookupSession` (so tests inject store stubs). **ID-token verification** *is* a function-shaped port: `IdTokenVerifier` (`verifiers.ts`), with `verifyGoogleIdToken`/`verifyAppleIdToken` as adapters and `AppDeps` (`index.ts`) as the DI seam tests use (`createApp({ googleVerifier })`), like `storeFactory` for `SyncStore`. The `changes`/`account` handlers only read `c.get('userId')`, never a `SyncStore` session method — so swapping to Better Auth / a hosted IdP touches the auth surface (`auth-middleware.ts`, `routes/auth.ts`, `routes/apple.ts`, `verifiers.ts`) plus `SyncStore`'s session/auth-code methods (`store.ts`, `d1-store.ts`) and their migrations; the sync handlers don't change.

## Data Model

D1 tables (`migrations/0001_init.sql`, plus later numbered migrations):

| Table | Holds | Key notes |
|---|---|---|
| `users` | `id`, `email`, `last_seq`, `created_at` | `last_seq` is the per-user sync cursor — bumped once per push, never per-row. |
| `identities` | `(provider, provider_sub)` → `user_id`, `email`, `created_at` | Composite PK. One row per linked provider — makes linking Google + Apple to one account additive, no schema change. |
| `tokens` | `token_hash` (PK), `user_id`, `device_name`, `expires_at`, `revoked_at`, `last_used_at`, `window_start`/`window_count`, `created_at` | The raw session token is never stored, only its SHA-256. Rate-limit counters live on the token's own row, so per-token limiting needs no separate table. |
| `auth_codes` | `code_hash` (PK), `payload` (JSON), `expires_at`, `used_at`, `code_challenge` | Apple's one-time exchange code (also hash-only). 60s TTL; `code_challenge` binds it to a PKCE verifier. `consumeAuthCode` DELETEs the row (single-use + PII gone at once), so `used_at` is now vestigial. |
| `records` | `(user_id, collection, entity_id)` (PK), `seq`, `ciphertext`, `deleted`, `client_updated_at`, `server_received_at` | See below. |

**`records` is upsert-per-entity, not append-only history.** The primary key is the entity's identity, so pushing an update to an entity `ON CONFLICT ... DO UPDATE`s the same row in place — one row per entity ever synced, storage bounded regardless of edit count. A delete sets `deleted = 1` (tombstone) rather than removing the row, because a physically-deleted row would be invisible to `WHERE seq > ?`, and a device that pulls after the delete would never learn the entity is gone. A daily cron (`worker.ts` `scheduled()` → `purgeTombstones`) reclaims tombstones older than `TOMBSTONE_RETENTION_MS` (= `SESSION_TTL_MS`, 90 days): a device idle that long is logged out and re-bootstraps from `since=0`, so it never needed the tombstone. This makes re-bootstrapping from `since=0` after a logout a client contract ENG-45 must honor: a client that resumes from a persisted stale cursor after re-login — or one that pushes but never pulls for 90+ days — could miss a purged delete.

`seq` is a per-user monotonic cursor, not a timestamp: `GET /changes?since=N` returns `WHERE seq > N`. `applyChanges` (`d1-store.ts`) assigns it like this:

```sql
UPDATE users SET last_seq = last_seq + ? WHERE id = ?        -- bump by batch size n, once
INSERT INTO records (..., seq, ...)
  VALUES (..., (SELECT last_seq FROM users WHERE id = ?) - ?, ...)   -- last_seq - (n-1-i)
  ON CONFLICT (user_id, collection, entity_id) DO UPDATE SET seq = excluded.seq, ...
```

The leading `UPDATE` bumps `last_seq` by `n`; each `INSERT`'s subquery re-reads that bumped value for its slot. **This must stay one `db.batch()`** — D1 runs a batch as one sequential transaction, the only reason each `INSERT` sees the `UPDATE`. Split it, and two concurrent pushes both apply their `UPDATE` first, so both `INSERT` sets read the same post-bump `last_seq` and hand out colliding `seq`s, breaking the monotonic cursor. (`d1-store.concurrency.test.ts` guards this.)

## API Surface

All endpoints are under `/v1`.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/v1/health` | Liveness check | No |
| `POST` | `/v1/auth/token` | Exchange a provider credential for a session token | No |
| `GET` | `/v1/auth/apple/start` | Begin the Apple server-bounce flow | No |
| `POST` | `/v1/auth/apple/callback` | Apple's redirect target; mints a one-time code | No |
| `POST` | `/v1/auth/logout` | Revoke the presented session token | Yes |
| `GET` | `/v1/changes?since=<seq>` | Incremental pull, ≤500 records/page (`since=0` = fresh-device bootstrap). A full page means pull again from the returned `cursor`. | Yes |
| `POST` | `/v1/changes` | Atomic batch push, ≤100 records, ≤64 KB ciphertext/record | Yes |
| `GET` | `/v1/export` | Dump all of the caller's records | Yes |
| `DELETE` | `/v1/account` | Delete user, identities, tokens, and records | Yes |

## Auth Flows

### Google

`POST /v1/auth/token` with `{provider: 'google', credential: <Google ID token>, deviceName}`. `verifyGoogleIdToken` (`verifiers.ts`) checks the signature against Google's live JWKS (`https://www.googleapis.com/oauth2/v3/certs`), `iss ∈ {accounts.google.com, https://accounts.google.com}`, and `aud ∈ GOOGLE_CLIENT_IDS` (comma-separated env var, split by `parseClientIds`). On success: `findOrCreateUser` + `createSession`.

### Apple (server bounce)

Apple only redirects to registered **https** URLs, so the Worker sits in the middle:

1. Client generates a PKCE `code_verifier` on-device and calls `GET /v1/auth/apple/start` with `return_uri` and `code_challenge` (`S256(verifier)`, 43 base64url chars) as query params. `return_uri` must **exactly match** an entry in `ALLOWED_RETURN_URIS` (prefix matching was a real bug — see Gotchas).
2. Server mints a `nonce`, HMAC-signs `{returnUri, codeChallenge, nonce}` as `state` (`signState`, keyed by `STATE_SIGNING_KEY`), and 302s to Apple with that `state` + `nonce`.
3. Apple authenticates the user and `POST`s back to `/v1/auth/apple/callback` with `id_token` + `state` (form-encoded).
4. Server verifies `state`'s HMAC (`verifyState`), verifies the Apple ID token via JWKS, and checks the token's `nonce` claim matches the one embedded in `state` — proof this ID token was minted for a flow *this server* started.
5. Server calls `mintAuthCode({provider:'apple', providerSub, email}, codeChallenge)` — a one-time code (60s TTL, hash-only storage) bound to the `codeChallenge` from `state` — and 302s to the client's `returnUri` with `?code=...`. No session token ever rides a URL.
6. Client calls `POST /v1/auth/token` with `{provider:'apple', credential: <code>, codeVerifier: <original verifier>, deviceName}`.
7. `parseTokenRequest` (`routes/auth.ts`) first rejects any `codeVerifier` outside RFC 7636 §4.1's 43-128 character range, or containing any character outside the unreserved set `[A-Za-z0-9._~-]`, with a 400, before the code is ever looked up — a malformed verifier alone can't burn it. Only past that guard does the server's `consumeAuthCode` burn the code atomically (`DELETE ... WHERE expires_at > ? RETURNING`) in the same statement that reads it — no reuse window, and the payload PII is gone at once. *Then* it checks `SHA256Base64Url(codeVerifier) === codeChallenge`. **A mismatch fails closed**: the code is already burned by the time the mismatch is detected, so a wrong verifier permanently kills that code rather than leaving it retryable.

**Client-side contract** — anyone wiring a new client to this flow must:
- Generate `code_verifier` on-device and never let it leave the device until the final `/v1/auth/token` call. Send only `code_challenge` (the S256 hash) to `/start`.
- Never call `/v1/auth/token` with an Apple `code` from a flow this device didn't itself initiate via `/start`.
- Never retry `exchangeToken` for `provider: 'apple'` — the code is single-use and already burned server-side by the time you'd know to retry (`packages/sync-client`'s `ApiClient` already encodes this; a hand-rolled caller must too).

### Sessions

`createSession` mints 32 random bytes, returns the raw token once, and stores only its SHA-256 (`tokens.token_hash`). The raw token and its hash are branded types (`RawSessionToken`/`SessionTokenHash` in `crypto-utils.ts`), so passing one where the other belongs — e.g. a hash into `revokeSession` — is a compile error, not a silent no-op. Expiry is sliding: every successful `lookupSession` pushes `expires_at` forward another `SESSION_TTL_MS` (90 days) and updates `last_used_at`. `POST /v1/auth/logout` sets `revoked_at`, which `lookupSession` checks going forward.

There's also a `provider: 'dev'` path, gated by `DEV_FAKE_AUTH === '1'` **and** a localhost `PUBLIC_BASE_URL`, that skips verification entirely and mints a session for whatever `credential` string you pass. Set off-localhost, it's refused and `logger.error`'d rather than honored. **Never enable this in production** — see Gotchas.

**Provider config fails closed.** An empty `APPLE_CLIENT_ID`/`GOOGLE_CLIENT_IDS` (the committed defaults) makes the verifier throw before `jwtVerify` → `internal` (500) + logged error, rather than accepting anything (an empty Apple string would make jose skip the `aud` check) or silently 401ing every sign-in. Provision both before serving traffic.

## Errors

Every error response is `application/problem+json` (RFC 9457), built by `problem()` in `problem-details.ts`.

`PROBLEM_DEFS` is the error contract — a `const` map of code → `{status, title}`, and `ProblemCode` is `keyof typeof PROBLEM_DEFS`. Adding a new error code means adding an entry there; nowhere else defines what codes exist.

| Code | Status | Meaning |
|---|---|---|
| `unauthorized` | 401 | No/malformed `Authorization` header |
| `invalid_token` | 401 | Session/ID-token/auth-code is bad, expired, or revoked |
| `rate_limited` | 429 | Per-token or per-IP limit exceeded |
| `batch_too_large` | 422 | Push exceeded `MAX_BATCH_SIZE` (100) |
| `invalid_record` | 422 | One or more records in a push failed validation |
| `storage_quota_exceeded` | 422 | Push would exceed the per-user record cap (`MAX_RECORDS_PER_USER`) |
| `payload_too_large` | 413 | Request body `Content-Length` exceeded `MAX_REQUEST_BODY_BYTES` |
| `invalid_cursor` | 400 | `since` isn't a plain non-negative safe integer |
| `invalid_request` | 400 | Malformed/unparseable body, or a structurally wrong one |
| `not_found` | 404 | No route matched |
| `internal` | 500 | Unhandled exception, upstream (JWKS) outage, or a config fault (empty signing key / client-id) |

Body: `type` (`https://cuewise.app/problems/<code-with-dashes>`), `title`, `status`, `code`, optional `detail`, `retryAfter` (mirrored as a `Retry-After` header), `errors[]` (`{index?, pointer?, detail}`).

- **400 vs 422**: 400 is unparseable JSON or a body that isn't even shaped right (`records` missing/not an array); 422 is well-formed but semantically invalid.
- **422 batch validation reports everything at once.** `validatePushBody`/`validateRecord` (`validate-changes.ts`) walk the whole array and accumulate every violation into one `errors[]`, each with a `/records/<i>/<field>` pointer — a client fixing a 20-record push doesn't get one error per round-trip.
- **Verifier failures are classified**, not blanket-401'd. `isTokenFault()` (`verifiers.ts`) distinguishes "this token is provably bad" (JOSE signature/claim/expiry errors) from anything else (e.g. a JWKS endpoint outage). Token faults → `invalid_token` (401, don't retry). Anything else is logged and answered `internal` (500, retryable client-side) — the *server's* upstream call failed, not the client's token.

## Rate Limiting

| Scope | Applies to | Limit | Window |
|---|---|---|---|
| Per-token, fixed window (`rate-limit.ts`) | `/v1/changes/*`, `/v1/export`, `/v1/account` | 60 req | 60s — counter anchored on the token's own D1 row, no extra infra |
| Per-IP, fixed window, isolate-local (`ip-rate-limit.ts`) | `/v1/auth/token`, `/v1/auth/apple/start`, `/v1/auth/apple/callback` | 30 req (default) | 60s — in-memory `Map`, resets on isolate recycle; defense-in-depth, production also fronts these with WAF rules |

Both emit `Retry-After`. `/v1/auth/logout` requires a Bearer token but isn't covered by either limiter. The IP limiter is bounded to 20,000 tracked IPs and skips entirely when `CF-Connecting-IP` is absent (a non-edge invocation).

## Local Dev & Testing

```bash
cd apps/api
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply cuewise-sync --local
npx wrangler dev
```

```bash
pnpm --filter @cuewise/api test        # Vitest, one-shot
pnpm --filter @cuewise/api test:watch
pnpm --filter @cuewise/api type-check
pnpm --filter @cuewise/api e2e         # scripts/e2e-roundtrip.mjs — needs `wrangler dev` running
```

Tests run through `@cloudflare/vitest-pool-workers` (`vitest.config.ts`) — inside a real Workers runtime with an in-memory D1, not a Node mock. `test/apply-migrations.ts` is wired as a `setupFiles` entry and applies every file in `migrations/` before each test file runs.

Tests are **co-located** (`foo.ts` next to `foo.test.ts`) — e.g. `src/crypto-utils.ts` / `src/crypto-utils.test.ts`. A couple of route tests use a more descriptive name than a strict mirror (`routes/apple.ts` → `routes/apple-auth.test.ts`, `routes/auth.ts` → `routes/auth-token.test.ts`). Fixtures live in `src/__fixtures__/`: `api-test-helpers.fixtures.ts` (`signedInToken`, `record`, `clockedStore`, `getChanges`/`postChanges`) and `jwks.fixtures.ts` (`createTestIdp` — an in-memory RS256 keypair + local JWKS so verifier tests never hit real Google/Apple endpoints).

`scripts/e2e-roundtrip.mjs` signs in two `dev`-provider devices, pushes one record from device A, pulls it from device B, and asserts the ciphertext round-trips byte-for-byte.

## Deploy (Not Done Yet)

```bash
npx wrangler d1 create cuewise-sync
# paste the returned database_id into wrangler.jsonc, replacing the 00000000... placeholder
npx wrangler d1 migrations apply cuewise-sync --remote
npx wrangler secret put STATE_SIGNING_KEY
# also fill in GOOGLE_CLIENT_IDS / APPLE_CLIENT_ID / PUBLIC_BASE_URL / ALLOWED_RETURN_URIS
# as plain `vars` in wrangler.jsonc
npx wrangler deploy
# route api.cuewise.app to this Worker in the Cloudflare zone
```

**Never set `DEV_FAKE_AUTH` in production.** It's a complete auth bypass gated by one env var equal to `'1'`.

## Common Gotchas

1. **Middleware registration order matters.** Hono runs `app.use(...)` in registration order and silently skips middleware registered after a matching route already exists. Every `app.use(...)` in `index.ts` is registered before the `register*Routes()` calls — keep it that way.
2. **`/v1/changes/*` already matches the bare `/v1/changes`.** Hono's wildcard matches the prefix with no trailing segment too, which is why `index.ts` registers middleware once at `/v1/changes/*` rather than at both that and `/v1/changes` — registering both would double-invoke the middleware per request.
3. **Empty `STATE_SIGNING_KEY` ⇒ Apple routes fail closed with 500**, by design (`requireStateSigningKey`). That's not a bug to work around — provision the secret.
4. **The `state` blob is trustworthy only because it's HMAC-signed.** Anything you add to `AppleState` inherits that guarantee automatically; anything you read from an unsigned source (a query param, a header) doesn't, no matter how it's later combined with `state`.
5. **Never log payloads, credentials, tokens, codes, verifiers, or the signing key.** Metadata only (see `verifyOrProblem`'s `logger.warn` — it logs `err.code`, never the token).
6. **Schema changes are additive migrations.** A new table/column is a new numbered file in `migrations/` — the test harness and `wrangler d1 migrations apply` both apply every migration in order, so there's no "edit an old migration" path.
