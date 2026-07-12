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

## Verifying the player CSP

Before shipping a change to the player's `frame-ancestors`
(`apps/website/functions/_middleware.ts`), prove it against a real client —
`frame-ancestors` matches the *embedder's* origin, not where the player is
hosted, so a player served locally with the real production headers exercises
the identical check.

1. Serve the site with real headers (build `dist/` first if it's stale): from
   `apps/website`, run `../api/node_modules/.bin/wrangler pages dev dist --port
   8788` (`wrangler` lives in `apps/api`'s devDeps, not the website's).
2. Point a client at it with `VITE_PLAYER_ORIGIN=http://localhost:8788`:
   - **Extension**: also set `VITE_EXTENSION_KEY=<store key>` so the unpacked
     build gets the *published* extension ID — without it `frame-ancestors`
     won't match and you'll get a false failure. Then `pnpm --filter
     @cuewise/browser-extension build` and load `dist/` unpacked.
   - **macOS, dev-server origin** (`http://localhost:1420`, already
     permanently allowlisted): `pnpm --filter @cuewise/macos dev`.
   - **macOS, bundled-app origin** (`tauri://localhost`): `tauri dev` never
     delivers any CSP to the webview at all (same reason `devCsp` is dead code
     — see the note at the bottom of `e2e/csp.spec.ts`), so it can't prove
     this path; the app's own `frame-src` (`'self' https://cuewise.app`) has
     to be extended too, which a static `tauri.conf.json` can't do per-env.
     `src-tauri/tauri.verify.conf.json` is a checked-in overlay that extends
     it — confirmed to deep-merge cleanly (only `frame-src` changes, every
     other directive is untouched) by running it against this project's real
     config. Build and run a debug binary with it:
     `pnpm --filter @cuewise/macos tauri build --config
     src-tauri/tauri.verify.conf.json --no-bundle --debug`, then run
     `src-tauri/target/debug/cuewise-macos`.
3. Play a soundscape. Success = the player iframe loads and audio plays.
   Failure = a `frame-ancestors` violation in the console.

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
