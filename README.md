# Cuewise

**A calm new tab.** Motivational quotes, daily goals, a Pomodoro timer, and productivity insights — every time you open a tab.

[**Install from the Chrome Web Store**](https://chromewebstore.google.com/detail/cuewise/abjkbnhoepcnmbabflkedbapbldnpkbf) · [cuewise.app](https://cuewise.app) · [Releases](https://github.com/kYem/cuewise/releases)

---

## Privacy first

Cuewise is open source and local-first. Your goals, quotes, sessions, and settings live on your device.

- **Nothing leaves your device by default.** Three features can send data, and each is off until you turn it on: end-to-end encrypted Cloud Sync, the Google Calendar agenda, and the Weather widget.
- **Cloud Sync is end-to-end encrypted.** Your data is encrypted on your device before it is sent. The server stores ciphertext it cannot read.
- **No analytics, no telemetry, no third-party trackers.** There is no tracking code in this repository.
- **Three permissions at install:** `storage`, `notifications`, `alarms`. Nothing else. Google access (`identity`) is an *optional* permission requested at runtime only if you connect Calendar or sign in to Sync — install it and never touch those, and you grant nothing Google-related.

Full details in the [privacy policy](https://cuewise.app/privacy).

## What it does

**Quotes** — 100 curated quotes across 10 categories, plus your own. Favourite, hide, browse history, track what you return to.

**Goals** — Today's focus with visual progress. Full history by date, filters, and one-click transfer of unfinished goals to tomorrow.

**Pomodoro** — Classic 25/5/15, fully adjustable. Ambient soundscapes, session history, and heatmaps of your most productive hours. A sticky widget keeps the timer reachable from any page.

**Focus mode** — Full-screen timer over a background image, with your quote underneath.

**Concepts** — Spaced-repetition cards for things you're learning, graded as you review them.

**Insights** — Streaks, daily/weekly/monthly trends, completion charts. Export everything as JSON or CSV.

**Reminders** — Scheduled and recurring, with browser notifications and snooze.

**Also** — Weather widget, quick links, an optional Google Calendar agenda, and optional end-to-end encrypted sync across devices.

**Make it yours** — Light/dark/auto, four colour themes (Purple, Forest, Rose, and the signature Glass), and three density modes.

## Platforms

| Platform | Status |
|---|---|
| Chrome / Edge extension | Live on the Chrome Web Store |
| macOS (Tauri) | In this repo, builds from source — not yet distributed |
| Web, mobile | Planned |

## Getting started

**Prerequisites:** Node >= 24, pnpm >= 8, a Chromium browser.

```bash
git clone https://github.com/kYem/cuewise.git
cd cuewise
pnpm install
pnpm --filter @cuewise/browser-extension build
```

Then load it in Chrome:

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `apps/browser-extension/dist`
4. Open a new tab

## Development

```bash
pnpm --filter @cuewise/browser-extension dev    # dev server with HMR, localhost:5173
pnpm --filter @cuewise/browser-extension test   # tests
pnpm lint                                       # Biome check (lint:fix to autofix)
pnpm type-check                                 # types across all packages
pnpm build                                      # build everything
```

## Repo layout

```
cuewise/
├── apps/
│   ├── browser-extension/   # Chrome/Edge extension (Manifest V3)
│   ├── macos/               # Native macOS app (Tauri + Swift posture sidecar)
│   ├── api/                 # Cloud-sync server (Cloudflare Worker + D1)
│   └── website/             # cuewise.app (Astro)
└── packages/
    ├── app/                 # Shared React app — components, stores, hooks
    ├── shared/              # Platform-agnostic types, utils, constants, ports
    ├── storage/             # Storage adapters and typed helpers
    ├── sync-engine/         # Sync cycle orchestration
    ├── sync-client/         # Typed cloud-sync API client
    ├── crypto/              # End-to-end encryption primitives
    ├── ui/                  # Shared UI primitives
    └── test-utils/          # Factories, mocks, fixtures
```

Platform differences are handled through ports and adapters, so the same React app runs in the extension and in the macOS shell. See [CLAUDE.md](./CLAUDE.md) for architecture and [ARCHITECTURE.md](./ARCHITECTURE.md) for the deeper guide.

**Tech:** React 18, TypeScript, Vite, Tailwind CSS 4, Zustand, Vitest, Biome, Turbo, pnpm workspaces.

## Contributing

Contributions welcome. Please write tests for new behaviour, keep TypeScript strict (no `any`), and run `pnpm lint:fix` before opening a PR. See [CLAUDE.md](./CLAUDE.md) for conventions and code style.

## Licence

MIT — see [LICENSE](./LICENSE).

**Exception:** the cloud-sync server (`apps/api/`) is AGPL-3.0-only, see [`apps/api/LICENSE`](./apps/api/LICENSE). The extension and apps only talk to it over HTTP, so this changes nothing for them — it means anyone running a modified copy of the sync server as a service must publish their source.
