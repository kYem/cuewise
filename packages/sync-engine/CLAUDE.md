# CLAUDE.md - Sync Engine (packages/sync-engine)

AI-assistant guide for `@cuewise/sync-engine`. Read the root [`CLAUDE.md`](../../CLAUDE.md) first — this file only covers what's specific to this package.

## What This Is

The ENG-45 orchestration layer sitting above `@cuewise/sync-client` (the wire — HTTP transport, retries, session) and `@cuewise/crypto` (the cipher — record sealing, key management). This package owns the logic neither of those leaves handles: mapping domain entities (goals, quotes, ...) to push/pull records, conflict resolution, and the fresh-device migration/merge state machine.

## Design Rules

- **Conflict resolution behind `ConflictStrategy`.** Never inline last-write-wins (or any other policy) at a call site — express it as a swappable strategy so the policy can change without touching orchestration code.
- **All sync metadata lives in `SyncMetadataStore`, never on domain types.** Goals/quotes/etc. in `@cuewise/shared` stay platform- and sync-agnostic; version vectors, last-synced timestamps, and dirty flags belong to this package's own store, not bolted onto shared entities.
- **Platform-agnostic via ports.** Like `@cuewise/sync-client`, this package consumes only `@cuewise/shared/platform` ports (`KeyValueStore`, `Scheduler`) — no `chrome.*`, no DOM, no Tauri imports — so the browser extension and the Tauri macOS app share one implementation.

## What's Here

`collections.ts` (entity ↔ record bindings), `strategy.ts` (`ConflictStrategy` / `LwwHlcStrategy`), `metadata-store.ts` (`SyncMetadataStore`), `mutation-tracker.ts` (`markMutated`/`markDeleted` → dirty-set + HLC), `record-map.ts` (seal/open a `PushRecord`), `key-lifecycle.ts` (enroll/self-heal), `cycle.ts` (`pullOnce`/`pushOnce`), and `engine.ts` (`SyncEngine`, the public façade tying all of it together).

## `SyncEngine` (`engine.ts`)

The one class apps construct. Public surface: `enableSync(credential, deviceName, recoveryCode?)`, `disableSync()`, `syncNow()` (pull-then-push), `start()`/`stop()` (arms/cancels the periodic pull wake), `markMutated`/`markDeleted` (delegate to `MutationTracker`), `getStatus()`. Status walks `disabled → signing_in → key_init/enrolling → initial_sync → active`, or `signed_out`/`error` on failure; every transition calls `deps.onStatus?.(status)`.

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

**Auth loss.** Any 401 (during `enableSync`, `syncNow`, or the pull wake) clears the session and stops the loop but keeps local data *and* the DK — status goes to `signed_out` so the user can silently re-authenticate later without re-enrolling the key.
