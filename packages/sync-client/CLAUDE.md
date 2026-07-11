# CLAUDE.md - Sync Client (packages/sync-client)

AI-assistant guide for `@cuewise/sync-client`. Read the root [`CLAUDE.md`](../../CLAUDE.md) first — this file only covers what's specific to this package. Server-side counterpart: [`apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md).

## What This Is

A **platform-agnostic** client for the ENG-43 cloud-sync API (`apps/api`) — no `chrome.*`, no DOM, no Tauri imports. It consumes only the `KeyValueStore` and `Scheduler` ports from `@cuewise/shared/platform`, the same ports the rest of the codebase uses (see root `CLAUDE.md` → Ports & Adapters). That's what lets the browser extension, the Tauri macOS app, and future web/mobile apps all share this one implementation instead of three.

## `ApiClient` (`api-client.ts`)

| Method | Endpoint | Auth |
|---|---|---|
| `exchangeToken(req)` | `POST /v1/auth/token` | No |
| `getChanges(since)` | `GET /v1/changes?since=` | Yes |
| `pushChanges(records)` | `POST /v1/changes` | Yes |
| `logout()` | `POST /v1/auth/logout` | Yes |
| `exportData()` | `GET /v1/export` | Yes |
| `deleteAccount()` | `DELETE /v1/account` | Yes |

**Retry policy**: up to `MAX_RETRIES = 3` retries after the initial attempt — 4 attempts total. Retries on network failure (a rejected `fetch`, e.g. offline/DNS — folded into the same path as a synthetic status-0 error), `429`, and `5xx`. Backoff is `2^attempt * 500ms`, unless the response carried `Retry-After`, which takes priority. Any other 4xx throws immediately, no retry.

**The Apple exception**: `exchangeToken` passes `retry: false` internally whenever `req.provider === 'apple'`. Apple's `credential` is the one-time code from the server bounce (see `apps/api/CLAUDE.md` → Auth flows) — it's burned the instant the server reads it, so retrying a lost or ambiguous response would replay an already-consumed code and turn a would-be-successful sign-in into a guaranteed 401. Google and dev exchanges are idempotent and keep retrying normally.

**`ApiError`** (`api-error.ts`) normalizes every failure — a non-2xx response or a thrown network error — into one shape: `code`, `status`, `retryable`, `retryAfter?`, `errors?`. `ApiError.fromResponse()` parses the server's problem+json body; if the body isn't valid JSON (e.g. an upstream 502 HTML page), it logs a warning and falls back to `code: 'internal'` rather than throwing while it's building an error.

## `SessionManager` (`session-manager.ts`)

Wraps one `KeyValueStore` key, `SYNC_SESSION_KEY`, always in the **`'local'`** storage area — never `'sync'`. The session token is a per-device credential; storing it in `'sync'` would replicate one device's token to every other device on the same profile, which defeats both per-device revocation (`logout()` only revokes the token that called it) and any future "devices signed in" list.

`saveToken()` returns the store's `StorageResult`. **Callers must check `.success`** — a `false` result means the token quota-failed to persist, so the caller is "authenticated for this request" but not durably signed in, and needs to surface that as distinct from a normal successful sign-in.

## Scheduling (`sync-schedule.ts`)

`armSyncPull(scheduler, delayMinutes, now?)` arms **one** one-shot wake (`SYNC_PULL_WAKE_ID`) via the `Scheduler` port. It does not reschedule itself — whatever host owns the fire subscription (`SchedulerHost.onFire`: the extension's service worker, the Tauri app's native scheduler) must call `armSyncPull` again inside its own fire handler to keep polling going. That re-arm wiring is the host app's responsibility, not this package's.

## Wire Types (`types.ts`)

`PushRecord`/`SyncRecord`/`ExchangeTokenRequest` are **re-exported, not redeclared**, from `@cuewise/shared` (`packages/shared/src/types.ts`) — the single source of truth also used by the server's `SyncStore` interface (`apps/api/src/store.ts`) and `parseTokenRequest` (`apps/api/src/routes/auth.ts`). Don't add a second definition here. `ExchangeTokenRequest` is a discriminated union on `provider` so `codeVerifier` is only required (and only typed) on the `'apple'` arm; the server still re-validates it at runtime since the wire is never trusted. `ProblemBody` mirrors the server's RFC 9457 shape and lives only in this package, since the server doesn't publish a shared client type for it.

## What's NOT Here

Out of scope for this package (belongs to ENG-45 unless noted):

- The mapping between Zustand store shapes (`goals`, `quotes`, ...) and individual `PushRecord`s.
- LWW (last-write-wins) conflict resolution.
- The fresh-device migration/merge state machine.
- Encryption — `ciphertext` is an opaque string to every function here. ENG-44 owns the real envelope; until it lands, callers pass a stub plaintext envelope through the same field, and this package can't tell the difference.

## Testing

Co-located: `api-client.test.ts` next to `api-client.ts`, `session-manager.test.ts` next to `session-manager.ts`. Fixtures in `src/__fixtures__/`:
- `fetch.fixtures.ts` — `stubFetch` queues canned `Response`s (or a rejection) for a fake `fetchFn`; `problemResponse` builds a spec-shaped problem+json stub.
- `ports.fixtures.ts` — `createInMemoryKeyValueStore` and `createRecordingScheduler`, in-memory stand-ins for the two platform ports this package depends on.

```bash
pnpm --filter @cuewise/sync-client test
pnpm --filter @cuewise/sync-client test:watch
pnpm --filter @cuewise/sync-client type-check
```
