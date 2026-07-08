# @cuewise/macos — native macOS app (Tauri shell)

Always-on native Cuewise: a **Tauri 2** app (Rust core + system WebView) that
reuses the extension's React UI, `@cuewise/ui`, and `@cuewise/shared`. This is the
shell — a window plus a menu-bar tray — that the focus timer and gentle
posture / break nudges plug into. (Rationale, market analysis, and stack decision
live in Linear: ENG-35 / ENG-41.)

## Stack

- **Shell:** Tauri 2 (`src-tauri/`, Rust) — main window + menu-bar tray.
- **Frontend:** Vite + React + Tailwind (`src/`), reusing the shared packages.
- **Platform seams:** `configurePlatform()` (from the #162 refactor) wires storage
  (`LocalStorageKeyValueStore` — the WKWebView has `localStorage`), a web notifier,
  and a placeholder scheduler. Real background scheduling moves to the Rust core
  later so wakes fire while the window is hidden (ENG-40).

## Run

Requires Rust + Node/pnpm. From the repo root:

```bash
pnpm install                      # links @cuewise/macos into the workspace
pnpm --filter @cuewise/macos dev  # tauri dev: builds Rust, starts Vite, opens the window
```

The first `cargo` build pulls the Tauri crates and takes a few minutes. Build a
distributable bundle with `pnpm --filter @cuewise/macos build`.

## Status → next

- [x] Shell scaffold: window + tray, platform seams wired, on-brand landing.
- [ ] Mount the real extension surfaces — new tab / Pomodoro / Insights (ENG-35).
- [ ] Tray webview popover for the posture/status widget (ENG-36).
- [ ] Swift/Vision posture sidecar over IPC (ENG-37).

## Notes

- `src/index.css` is copied from the extension for now. It should be extracted to
  a shared package so the extension and this app stay in sync — follow-up.
