# CLAUDE.md - Sync Engine (packages/sync-engine)

AI-assistant guide for `@cuewise/sync-engine`. Read the root [`CLAUDE.md`](../../CLAUDE.md) first — this file only covers what's specific to this package.

## What This Is

The ENG-45 orchestration layer sitting above `@cuewise/sync-client` (the wire — HTTP transport, retries, session) and `@cuewise/crypto` (the cipher — record sealing, key management). This package owns the logic neither of those leaves handles: mapping domain entities (goals, quotes, ...) to push/pull records, conflict resolution, and the fresh-device migration/merge state machine.

## Design Rules

- **Conflict resolution behind `ConflictStrategy`.** Never inline last-write-wins (or any other policy) at a call site — express it as a swappable strategy so the policy can change without touching orchestration code.
- **All sync metadata lives in `SyncMetadataStore`, never on domain types.** Goals/quotes/etc. in `@cuewise/shared` stay platform- and sync-agnostic; version vectors, last-synced timestamps, and dirty flags belong to this package's own store, not bolted onto shared entities.
- **Platform-agnostic via ports.** Like `@cuewise/sync-client`, this package consumes only `@cuewise/shared/platform` ports (`KeyValueStore`, `Scheduler`) — no `chrome.*`, no DOM, no Tauri imports — so the browser extension and the Tauri macOS app share one implementation.

## What's Here (later tasks)

Currently a scaffold only — `src/index.ts` is `export {}`. Subsequent ENG-45 tasks fill in the entity-to-record mapping, `ConflictStrategy` implementations, `SyncMetadataStore`, and the migration/merge state machine.
