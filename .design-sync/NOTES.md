# design-sync notes — @cuewise/ui

Shape: **package** (no Storybook). Synced project: **CueWise UI** (`6edd7ce0-6566-481b-ae1c-7a5e76fb9ce7`).

## Re-sync command

```sh
cp -r <skill-base>/{package-build,package-validate,package-capture,resync}.mjs <skill-base>/lib <skill-base>/storybook .ds-sync/   # refresh staged scripts
node .design-sync/prepare.mjs                                                                                                     # buildCmd: compile CSS + entry
# fetch project _ds_sync.json -> .design-sync/.cache/remote-sync.json, then:
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules apps/browser-extension/node_modules \
  --entry packages/ui/dist/ds-entry.mjs --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```
`.ds-sync/` deps: `npm i esbuild ts-morph @types/react playwright@1.61.0` (the `.ds-sync/node_modules` is gitignored, so a fresh clone reinstalls them). Chromium build 1228 is cached and 1.61.0 pins it — **on macOS the cache is `~/Library/Caches/ms-playwright/` (NOT `~/.cache/ms-playwright`, which is the Linux path)**. Use `./node_modules/.bin/playwright install chromium`, not `npx playwright …` (npx re-resolves and hits the private registry).

## Repo-specific gotchas (why the config looks the way it does)

- **`@cuewise/ui` has no build/dist** — it's consumed as raw TS (`main: ./src/index.ts`). `.design-sync/prepare.mjs` (the `buildCmd`) generates both build inputs into `packages/ui/dist/` (gitignored): `cuewise.css` (the `cssEntry`) and `ds-entry.mjs` (the bundle `entry`).
- **`index.ts` re-exports `./styles.css?inline`**, which esbuild can't bundle. `prepare.mjs` regenerates `ds-entry.mjs` from `index.ts` minus that line (rewriting `./` → `../src/`). If a component is added to `index.ts` it's picked up automatically; if the `styles` export line changes, check the `.css` filter in `prepare.mjs`.
- **Tokens/theme live in `apps/browser-extension/src/index.css`, not in the package.** `.design-sync/ds-tailwind.src.css` imports it and adds `@source` globs for both `packages/ui/src` and `apps/browser-extension/src` so every component utility class compiles. Compiled with the extension's `@tailwindcss/postcss` (resolved from `apps/browser-extension`).
- **`--node-modules` must be `apps/browser-extension/node_modules`** — root `node_modules` is strict pnpm (no hoisted packages), and `packages/ui/node_modules` lacks `react-dom`. The extension's node_modules has the `@cuewise/ui` symlink + `react` + `react-dom` + `recharts` + `lucide-react`.
- **Fonts (Inter/Poppins) are remote** — loaded via a Google Fonts `@import` that `prepare.mjs` prepends to the compiled CSS (the app loads them the same way via `index.html`). Validate reports `[FONT_REMOTE]` (expected, not missing). No local woff2 ships.
- **Two recharts copies (2.15.4 + 3.8.1).** recharts 3 shares chart sizing via a store the preview's separately-bundled copy can't read, so `ChartContainer`'s `ResponsiveContainer` (DS-bundle recharts) can't size a preview `BarChart`. Fix: the `ChartContainer.tsx` preview gives `BarChart` **explicit `width`/`height`** so it renders standalone. Keep this if recharts stays split.
- **Preview files can't use arbitrary Tailwind classes** (e.g. `h-[260px]`) — `.design-sync/previews/` is not in the CSS `@source` scan. Use inline `style` for preview layout/sizing.

## Overlay/controlled component previews

- `Select` — `autoOpen` shows the open dropdown; `cardMode: column` so both Closed/Open rows fit (dropdown is absolute; the Open wrapper reserves height).
- `Popover` — `defaultOpen` + `cardMode: single` so the Radix portal renders in-card.
- `ToastContainer` — `position: fixed`; the preview wraps it in a `transform: translateZ(0)` ancestor to scope the fixed stack into the card. `cardMode: single`.
- `Autocomplete` — open dropdown is focus-only and **cannot render statically**; only input states (default/value/error) are shown.
- `Tooltip` — Radix tooltip is hover/focus-only; the preview composes the parts (`TooltipProvider`/`TooltipRoot defaultOpen`/`TooltipTrigger`/`TooltipContent`) so the bubble renders statically. `cardMode: single`, `viewport: 360x220`, `side="bottom"`. The convenience `<Tooltip label … side …>` (wraps its own provider) is documented in the prompt/conventions; only the top-level `Tooltip` is authored — the 4 parts are floor cards.

## Guidelines (brand docs that ship to the design project)

`.design-sync/guidelines/*.md` (colors, typography, spacing, brand) are wired via
`guidelinesGlob` → they copy into the bundle's `guidelines/` on every sync. Keep
their token values in step with `apps/browser-extension/src/index.css` (the real
`@theme`) and `CATEGORY_COLORS` in `packages/shared/src/constants.ts`. They ship as
markdown reference docs, not visual swatch cards.

## Known render warns (re-syncs: treat as clean)

- `[FONT_REMOTE]` "Inter", "Poppins" — runtime remote Google Fonts, by design.

## Re-sync risks (watch list)

- `prepare.mjs` artifacts (`packages/ui/dist/{cuewise.css,ds-entry.mjs}`) are gitignored and regenerated by `buildCmd` — always run it before the driver.
- The `@source` globs in `ds-tailwind.src.css` must still cover new component locations; a component placed outside `packages/ui/src` would ship unstyled.
- The recharts explicit-dims workaround is tied to recharts staying split across instances / recharts 3's store model.
- Captured font fidelity depends on network access (remote fonts); offline runs render fallback fonts but still pass.
- 15 sub-part exports (CardHeader/CardTitle/CardContent, Popover* parts, Chart* parts, Tooltip* parts) ship as **floor cards** by design — authorable on any re-sync if richer cards are wanted.

## Do NOT touch the other project

`CueWise Design` (`a2b9ee72-4398-4e75-be97-a65b3e410cae`) is a **hand-curated** design project (guideline cards, extension mockups, page templates) that the automated converter cannot reproduce. This sync deliberately targets a separate project (`CueWise UI`). Never auto-sync into `CueWise Design`.
