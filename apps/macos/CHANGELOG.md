# @cuewise/macos

## 0.2.2

### Patch Changes

- Updated dependencies [0559dd2]
- Updated dependencies
- Updated dependencies [328ff4a]
  - @cuewise/shared@1.18.0
  - @cuewise/storage@1.18.0
  - @cuewise/ui@1.18.0
  - @cuewise/app@1.16.2
  - @cuewise/sync-client@0.1.3
  - @cuewise/sync-engine@0.1.3

## 0.2.1

### Patch Changes

- The seeded Pomodoro-music playlists now lead with a CueWise-owned Deep Focus playlist, replacing the broken third-party Lofi Hip Hop default whose first video was removed (grey tile, dead embed). The old third-party Deep Focus entry is gone too; a saved Deep Focus selection rolls onto the new playlist automatically.
- Updated dependencies
  - @cuewise/shared@1.17.1
  - @cuewise/app@1.16.1
  - @cuewise/storage@1.17.1
  - @cuewise/sync-client@0.1.2
  - @cuewise/sync-engine@0.1.2
  - @cuewise/ui@1.17.1

## 0.2.0

### Minor Changes

- 374d7a8: Tasks now roll into Today automatically when their due date arrives. Incomplete tasks whose deadline is today or earlier move into the Today list on load and at midnight (including when the machine wakes past midnight), instead of waiting for a manual transfer (tasks you've deliberately scheduled for a future day stay put). A new "Auto-roll due tasks" toggle in goal settings turns it off; manual transfer counts are unaffected.

### Patch Changes

- e83d0b1: Goal edits and data imports now surface storage write failures instead of silently reverting. When a write fails (e.g. storage quota), editing, linking, adding, deleting, transferring, or re-dating a task shows an error toast and keeps the previous state, rather than displaying a change that would vanish on the next reload. Imports no longer report "Successfully imported" when the write never landed — a quota failure now shows the storage-full message and honest partial counts.
- 2169ac2: Storage-full errors are now recognized on the macOS app (and any localStorage-backed context): a quota failure surfaces as "storage is full" guidance instead of a generic retry suggestion that could never succeed.
- Updated dependencies [374d7a8]
- Updated dependencies [e83d0b1]
- Updated dependencies [2169ac2]
  - @cuewise/app@1.16.0
  - @cuewise/shared@1.17.0
  - @cuewise/storage@1.17.0
  - @cuewise/sync-client@0.1.1
  - @cuewise/sync-engine@0.1.1
  - @cuewise/ui@1.17.0

## 0.1.1

### Patch Changes

- Updated dependencies [c81b692]
  - @cuewise/ui@1.16.0
  - @cuewise/app@1.15.1
