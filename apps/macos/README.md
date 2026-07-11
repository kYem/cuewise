# @cuewise/macos — native macOS app (Tauri shell)

Always-on native Cuewise: a **Tauri 2** app (Rust core + system WebView) that
reuses the extension's React UI, `@cuewise/ui`, and `@cuewise/shared`. This is the
shell — a window plus a menu-bar tray — that the focus timer and gentle
posture / break nudges plug into. (Rationale, market analysis, and stack decision
live in Linear: ENG-35 / ENG-41.)

## Stack

- **Shell:** Tauri 2 (`src-tauri/`, Rust) — main window + menu-bar tray.
- **Frontend:** Vite + React + Tailwind (`src/`), reusing the shared packages.
- **Platform adapters:** `configurePlatform()` (from the #162 refactor) wires the
  adapters — storage
  (`LocalStorageKeyValueStore` — the WKWebView has `localStorage`), a native Tauri
  notifier, and a Rust-backed scheduler that fires wakes while the window is hidden
  (ENG-40).

## Run

Requires Rust + Node/pnpm. From the repo root:

```bash
pnpm install                      # links @cuewise/macos into the workspace
pnpm --filter @cuewise/macos dev  # tauri dev: builds Rust, starts Vite, opens the window
```

The first `cargo` build pulls the Tauri crates and takes a few minutes. Build a
distributable bundle with `pnpm --filter @cuewise/macos bundle`.

### Posture sidecar (macOS-only, opt-in)

On-device posture tracking runs as a Swift sidecar (`posture-sidecar/`, reusing
`PostureKit`'s Vision analysis) that streams `PostureSample` JSON over stdio. Build
it before `dev` / `bundle` so Tauri can resolve the externalBin — otherwise the
spawn fails with "No such file or directory":

```bash
pnpm --filter @cuewise/macos build:sidecar  # swift build + copy into src-tauri/binaries/
```

Frames are analyzed in memory only — no image is ever stored or sent.

## Status → next

- [x] Shell scaffold: window + tray, platform ports wired, on-brand landing.
- [x] Mount the real extension surfaces — new tab / Pomodoro / Insights (ENG-35).
- [x] Native background scheduler — reminders fire while hidden (ENG-40).
- [x] Menu-bar tray status: live Pomodoro timer + controls (ENG-36).
- [x] Swift/Vision posture sidecar over IPC — reused analysis, live stream (ENG-37).
- [ ] Real posture UI in a Settings section (design-system components).

## Notes

- `src/index.css` is copied from the extension for now. It should be extracted to
  a shared package so the extension and this app stay in sync — follow-up.
