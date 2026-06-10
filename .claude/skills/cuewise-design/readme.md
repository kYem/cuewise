# Cuewise — Design System

> Turn every new tab into a moment of intention.

Cuewise is a **Chrome new-tab extension** for mindful productivity. Each time
you open a tab you're met with a large clock, a hand-picked quote, your focus
goals, reminders, and a Pomodoro timer — calm tools that get out of the way.
The aesthetic is **soft, airy, and violet-tinted**: rounded cards floating on a
gentle gradient, generous whitespace, big friendly display type. Nothing
shouts. Privacy-first; all data is local.

This design system reproduces Cuewise's visual language as portable tokens,
components, and full-screen UI-kit recreations so new surfaces (marketing,
docs, decks, companion apps) stay on-brand.

## Sources

- **Codebase (source of truth):** the attached `apps/browser-extension` folder
  — a Vite + React 18 + TypeScript MV3 extension. Styling is **Tailwind v4**
  (`src/index.css`) using **OKLCH** custom properties under `@theme`.
- **Repo:** `github.com/kyem/cuewise` (monorepo; `@cuewise/shared`, `/ui`,
  `/storage` workspace packages were not in the attached folder — see Caveats).
- **Store listing:** `DESCRIPTION.md`, `README.md`, `store-assets/` (screenshots
  + promo tiles, mirrored under `_ref/` for reference).
- Icons: **lucide-react**. Charts: **recharts**.

---

## Content fundamentals

How Cuewise writes:

- **Voice — warm, calm, encouraging coach.** Second person ("you", "your"). It
  reassures rather than nags: *"No overwhelming task lists. No artificial
  deadlines. Just wisdom, intention, and progress."*
- **Aspirational but grounded.** Headlines lean poetic — *"Turn your day into a
  meaningful journey"*, *"Your daily compass"* — while UI copy stays plain and
  functional: *"Today's Focus"*, *"What matters most today?"*, *"New Quote"*,
  *"Show Incomplete"*.
- **Gentle imperatives** for actions: *"Add"*, *"Start"*, *"Show All
  Categories"*, *"Work on a goal (optional)"*. Buttons name the outcome.
- **Casing:** Title Case for headings and buttons ("Today's Focus", "Add
  Quote", "View Insights"); sentence case for helper/secondary text ("Stay on
  top of what matters", "Focus for 25 minutes, then take a 5-minute break").
- **Time-aware & personal:** greets with "Good Morning / Afternoon / Evening";
  counts progress ("2 of 8 completed", "Viewed 588 times").
- **Emoji:** used *sparingly* as warmth accents — 💭 on a quote note, 🎵 beside
  now-playing, ☕ Coffee while a background loads. Marketing copy uses section
  emoji (✨📖🎯). Never load-bearing; never in dense UI.
- **Vibe words:** wisdom, intention, mindful, momentum, clarity, journey,
  breathe, refocus, what matters.

---

## Visual foundations

**Color.** A single violet primary scale (hue ~285°, `primary-600` =
`oklch(0.54 0.24 285)` is the action color) over near-white neutrals with a
faint violet tint. Everything is defined in **OKLCH**. Four shipped themes —
**Purple** (default), **Forest** (green 145°), **Rose** (pink 2°), **Glass**
(frosted transparent surfaces over a daily Unsplash photo) — each with a
light + dark variant. **Functional** colors (success green, warning amber,
error red) are theme-independent. Ten **quote-category** colors give each quote
a consistent identity across its badge and insight bar.

**Background.** Never flat — a soft three-stop **diagonal gradient**
(`--gradient-background`, top-left→bottom-right, very low chroma). Glass theme
swaps it for a full-bleed photo with frosted cards.

**Glass mode (the signature look).** Cuewise's most distinctive surface:
frosted, translucent **black** cards (`--glass-card` = `rgba(0,0,0,.25)`) with a
**16px backdrop-blur**, hairline white borders, and **white text** floating over
a full-bleed background photo. Activate with `[data-theme="glass"]` (tokens in
`tokens/glass.css`). All text carries `--glass-text-shadow` for legibility on
any photo, and a top/bottom `--glass-scrim` keeps chrome readable over bright
images. The product pulls a **daily curated Unsplash photo** by category
(nature/forest/ocean/mountains/minimal/dark, see `utils/unsplash.ts`) behind a
"Brewing your view" ☕ loader. For a **self-contained** system this kit ships
three on-brand mesh-gradient backdrops (`assets/bg-{aurora,dusk,mist}.png` — the
product's "minimal" category) and defaults to them; swap in any photo URL for
the live experience. See `ui_kits/glass/` and the **Glass surfaces** card.

**Type.** Two families: **Poppins** (600/700/800) for display — the clock,
hero headlines, page titles, quote bodies and section headings; **Inter**
(300–700) for everything else. The Pomodoro timer uses a **mono** stack for
stable digits. Display type goes big and tight (clock ~72px/800,
`letter-spacing:-0.02em`); quote size scales down by length to avoid layout
shift.

**Cards.** White/`surface` panels, **`rounded-2xl` (16px)** corners,
**`shadow-lg`** soft diffuse shadow, hairline `1px` `border` in the tinted
neutral. Often **`backdrop-blur-sm` over a translucent surface** (`bg-surface/80`)
so the gradient glows through. Stat tiles use `rounded-xl` (12px). List rows
use `rounded-lg` (8px) with a **2px** border that turns `primary-300` on hover.

**Shape language.** Pills everywhere: category badges, the Pomodoro chip, the
status switcher, floating nav buttons are **fully-round** (`rounded-full`).
Icon buttons are circular with a translucent surface.

**Spacing & density.** Spacing is a **density-aware scale** (`--spacing-xs…2xl`)
driven by `[data-density]`: **compact / comfortable / spacious** also scale the
root font-size (0.875 / 1 / 1.125). Layouts are centered, `max-w-7xl`, with
lots of air.

**Motion.** Subtle and calm. `fadeIn` (0.5s ease-in-out) on quotes, `slideUp`
(0.4s ease-out) on modals; hovers are **200ms** color/shadow plus a small
`scale(1.05–1.1)` lift on floating buttons. Progress fills animate 500ms ease-out.
Two looping accents exist only for the Glass loading state (`float`,
`bounceDots`). Everything collapses under `prefers-reduced-motion`.

**States.** Hover = lighter/darker surface + soft shadow grow + slight scale;
press = deeper primary shade + slight scale-down. Focus = `ring-2
ring-primary-500 ring-offset-2`. Disabled = reduced opacity, `not-allowed`.

**Transparency & blur.** Core to the look — floating chrome and the Glass theme
lean on `bg-*/ <alpha>` + `backdrop-blur`. Quote text carries a soft
`text-shadow` so it stays legible over any theme/photo.

**Imagery.** Optional Glass-theme backgrounds are real photography from
**Unsplash** by category (nature, etc.), shown full-bleed under frosted cards
with an optional `bg-black/25` legibility overlay.

---

## Iconography

- **Library: [lucide-react](https://lucide.dev)** — clean 2px-stroke outline
  icons, used at `w-4/5/6 h-4/5/6` (16/20/24px). This is the *only* icon system;
  no custom SVG icon set, no icon font. Consumers should load Lucide
  (`https://unpkg.com/lucide@latest`) or `lucide-react` and match the 2px
  outline weight.
- **Semantic mapping** (`src/components/icons.tsx`): Goal → `Flag`, Task →
  `ListTodo`, Focus → `Target`. Other recurring icons: `Timer`/`Coffee`
  (Pomodoro), `BookMarked` (quotes), `BarChart3`/`Award` (insights), `Settings`,
  `Heart` (favorite), `RefreshCw` (new quote), `EyeOff` (hide), `Bell`
  (reminders), `Play/Pause/RotateCcw/SkipForward` (timer), chevrons.
- **Color:** icons inherit `text-primary` or sit in a tinted
  `bg-primary-100` rounded-lg chip with a `text-primary-600` glyph (the
  recurring "section icon" motif).
- **Emoji** appear only as occasional warmth accents (see Content), never as UI
  icons.
- **Brand mark — "Cue Dot":** an open violet ring (an unhurried, open new-tab
  moment) cradling a focal **cue dot**, also reading as a **C**. Files in
  `assets/`: `logo-mark.svg` (+ `-white`), `logo-horizontal.svg`,
  `icon.svg` (gradient squircle app icon) and rasterized `icon-16/48/128/256/1024.png`.
  See the **Brand** specimen card (`guidelines/brand-logo.html`).

---

## Index / manifest

**Root**
- `styles.css` — global entry point (`@import`s the token + base closure). Link this.
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skills front matter for Claude Code.

**`tokens/`** — `fonts.css` · `colors.css` · `typography.css` · `spacing.css` · `glass.css` · `base.css`

**`guidelines/`** — foundation specimen cards (Type, Colors, Spacing, Brand).

**`assets/`** — `logo-mark.svg`, `logo-mark-white.svg`, `logo-horizontal.svg`, `icon.svg` (squircle app icon), `icon-{16,48,128,256,1024}.png`, and Glass backdrops `bg-{aurora,dusk,mist}.png`.

**`components/core/`** — reusable primitives: `Button`, `IconButton`,
`CategoryBadge`, `Card`, `Toggle`, `StatCard` (+ `.d.ts`, `.prompt.md`, card HTML).

**`ui_kits/`**
- `glass/` — **Glass new-tab** (frosted cards over a photo) — the showcase surface.
- `glass-pomodoro/` · `glass-insights/` · `glass-quotes/` — the other screens re-skinned
  in Glass (reuse each light kit's `app.jsx` under a frosted shell).
- `new-tab/` — the home new-tab view (clock, quote, goals, reminders, floating nav).
- `pomodoro/` — focus timer screen.
- `insights/` — stats dashboard (streaks, category bars, achievement summary).
- `quotes/` — quote management library (search, filter tabs, quote cards).

**`_ref/`** — product screenshots & promo tiles (reference only).

---

## Caveats

- **Workspace UI primitives.** `@cuewise/ui` (`Button`, `Toast`, `Popover`,
  `cn`) and `@cuewise/storage` aren't bundled here; the shared UI primitives
  are faithful cosmetic recreations from their usage sites. Category colors and
  brand hexes are now the **exact values from `@cuewise/shared` (`constants.ts`)**,
  verified against the GitHub source.
- **Default theme is `forest`.** Per `DEFAULT_SETTINGS.colorTheme`, a fresh
  install defaults to **Forest Green** — but every store screenshot and the
  marketing identity use **Purple**, so this system treats violet as the brand.
  Tell me if you'd rather center the system on Forest.
- Fonts load from **Google Fonts** (matching the product), not bundled `.ttf`s.
