# CLAUDE.md - Sync Engine (packages/sync-engine)

AI-assistant guide for `@cuewise/sync-engine`. Read the root [`CLAUDE.md`](../../CLAUDE.md) first — this file only covers what's specific to this package.

## What This Is

The ENG-45 orchestration layer sitting above `@cuewise/sync-client` (the wire — HTTP transport, retries, session) and `@cuewise/crypto` (the cipher — record sealing, key management). This package owns the logic neither of those leaves handles: mapping domain entities (goals, quotes, ...) to push/pull records, conflict resolution, and the fresh-device migration/merge state machine.

## Design Rules

- **Conflict resolution behind `ConflictStrategy`.** Never inline last-write-wins (or any other policy) at a call site — express it as a swappable strategy so the policy can change without touching orchestration code.
- **All sync metadata lives in `SyncMetadataStore`, never on domain types.** Goals/quotes/etc. in `@cuewise/shared` stay platform- and sync-agnostic; version vectors, last-synced timestamps, and dirty flags belong to this package's own store, not bolted onto shared entities.
- **Platform-agnostic via ports.** Like `@cuewise/sync-client`, this package consumes only `@cuewise/shared/platform` ports (`KeyValueStore`, `Scheduler`) — no `chrome.*`, no DOM, no Tauri imports — so the browser extension and the Tauri macOS app share one implementation.

## What's Here

`collections.ts` (entity ↔ record bindings), `strategy.ts` (`ConflictStrategy` / `LwwHlcStrategy`), `metadata-store.ts` (`SyncMetadataStore`), `mutation-tracker.ts` (`markMutated`/`markDeleted` → dirty-set + HLC), `record-map.ts` (seal/open a `PushRecord`), `key-lifecycle.ts` (enroll/self-heal), `cycle.ts` (`pullOnce`/`pushOnce`), `engine.ts` (`SyncEngine`, the public façade tying all of it together), and `create-engine.ts` (`createSyncEngine`, the one-call host constructor). `golden-path.test.ts` is the two-device end-to-end integration test (two `SyncEngine`s, separate `FakeKvStore`s, one shared `FakeSyncServer`) plus the swappability guard (`__fixtures__/noop-strategy.ts`'s `NoopStrategy`, which always returns `{winner:'local'}` — proves `SyncEngine`/`cycle.ts` route every conflict decision through `ConflictStrategy` and hardcode no LWW).

## `createSyncEngine` (`create-engine.ts`)

Host apps should construct through this factory rather than hand-assembling `ApiClient` + `SessionManager` + `SyncEngine`: `createSyncEngine({ baseUrl, keyStore, scheduler, ...SyncEngineDeps overrides })` builds a `SessionManager` over `keyStore`, an `ApiClient` wired to that session's `getToken`, constructs the `SyncEngine`, and — as its last step — calls `configurePlatform({ syncSink: engine })` (from `@cuewise/shared/platform`) so the engine is immediately wired as the store layer's `SyncMutationSink`. Constructing the engine IS registering it; there's no separate manual step, so it can't be forgotten. (`SyncEngine` itself does not self-register in its constructor — only this factory does — so `engine.test.ts`/`golden-path.test.ts`, which build `SyncEngine` directly with fakes, never touch global platform state.) This is what both `apps/browser-extension/src/background.ts` and `apps/macos/src/main.tsx` call.

**Current app wiring is dev-flagged and off by default** (a non-empty `VITE_SYNC_API_BASE_URL` IS the enable signal — unset by default) — when set it also enables the Cloud Sync settings section; production builds leave it unset and never construct the engine. When it's set, both hosts call `engine.start()` unconditionally (a no-op unless `enableSync()` was already run some other way, e.g. devtools) and wire the pull-wake wire below. The extension's `manifest.config.ts` and the Tauri app's `tauri.conf.json` `devCsp` (never `csp`, the production block) each add the dev sync-API origin to `connect-src` only in non-production builds.

## `SyncEngine` (`engine.ts`)

The one class apps construct. Public surface: `enableSync(provider, credential, deviceName, {recoveryCode?, codeVerifier?})`, `resumeEnrollWithCode(recoveryCode)` (ENG-65: finishes a needs-code enroll against the still-live session, so device #2 supplies the code without a second sign-in bounce; no-ops to `signed_out` if that session was lost), `disableSync()`, `syncNow()` (pull-then-push), `start()`/`stop()` (arms/cancels the periodic pull wake), `markMutated`/`markDeleted` (delegate to `MutationTracker`), `getStatus()`. Status walks `disabled → signing_in → key_init/enrolling → initial_sync → active`, or `signed_out`/`error` on failure; every transition calls `deps.onStatus?.(status)`.

`SyncEngineDeps.apiClient` is typed as `EngineApiClient` — a `Pick<ApiClient, ...>` structural subset (auth + pull/push + key-envelope calls), not the concrete `ApiClient` class. A real `ApiClient` instance satisfies it directly (structural typing); tests substitute an in-memory fake. `sessionManager`/`keyStore`/`scheduler` take the real `SessionManager` class / `KeyValueStore` / `Scheduler` ports directly — construct `SessionManager` over a fake `KeyValueStore` in tests instead of hand-rolling a fake session manager.

**Host wiring — the pull loop.** `armSyncPull` (from `@cuewise/sync-client`) only schedules a *single* wake; something has to re-arm it forever. `SyncEngine` does not hold a live `SchedulerHost` subscription itself (only the command-only `Scheduler` port), so the resident host (extension service worker, Tauri app loop) is responsible for the fire subscription:

```typescript
schedulerHost.onFire((id) => {
  if (id === SYNC_PULL_WAKE_ID) {
    engine.handlePullWake(); // runs syncNow() then re-arms the next wake
  }
});
```

`engine.start()` (call once per app/tab open) self-heals the DK against the server (`selfHealKeyBlob` — typed `SelfHealNeedsEnrollError`/`SelfHealUnrecoverableError` land the engine in `signed_out` rather than crashing), then syncs and arms the first pull wake if `cloudSyncEnabled` is set. `engine.stop()` just cancels the armed wake; it does not touch the session or the DK — use `disableSync()` for that.

**Known limitation — Chrome extension realms.** `createSyncEngine` (and thus the sink registration) only runs in `background.ts`'s service-worker realm; store mutations happen in `main.tsx`'s page realm, a separate MV3 JS module state, so `getSyncSink()` there is always null and page-realm mutations never push (pull still works). See the `TODO(ENG-45)` in `apps/browser-extension/src/main.tsx`. The macOS app is unaffected (single Tauri webview realm).

**Auth loss.** Any 401 (during `enableSync`, `syncNow`, or the pull wake) clears the session and stops the loop but keeps local data *and* the DK — status goes to `signed_out` so the user can silently re-authenticate later without re-enrolling the key.
