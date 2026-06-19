# Colors

CueWise is **violet-tinted**. Colors are CSS tokens (OKLCH) consumed through Tailwind utility classes. Always prefer the token classes below over raw Tailwind palette colors so the UI re-themes correctly. Values shown are the default **purple, light** theme.

## Primary (brand violet) — scale 50–900

Utilities: `bg-primary-600`, `text-primary-600`, `border-primary-500`, … (`*-primary-50` … `*-primary-900`). 600 is the default action color, 700 the hover.

| Step | OKLCH (purple light) |
|---|---|
| 50 | `0.98 0.01 300` |
| 100 | `0.96 0.03 300` |
| 200 | `0.92 0.06 295` |
| 300 | `0.84 0.12 290` |
| 400 | `0.72 0.19 285` |
| 500 | `0.62 0.24 285` |
| **600** | `0.54 0.24 285` ← primary action |
| 700 | `0.48 0.22 285` ← hover |
| 800 | `0.4 0.18 285` |
| 900 | `0.34 0.14 285` |

## Semantic tokens

| Role | Class | Value (purple light) |
|---|---|---|
| Page background | `bg-background` | `white` |
| Surface (cards) | `bg-surface` | `oklch(0.99 0.005 300)` |
| Raised surface | `bg-surface-elevated` | `white` |
| Subtle surface | `bg-surface-variant` | `oklch(0.97 0.01 300)` |
| Body text | `text-primary` | `oklch(0.2 0.01 300)` |
| Secondary text | `text-secondary` | `oklch(0.45 0.01 300)` |
| Tertiary text | `text-tertiary` | `oklch(0.6 0.01 300)` |
| Border | `border-border` | `oklch(0.9 0.005 300)` |
| Divider | `border-divider` | `oklch(0.95 0.005 300)` |

> `text-primary` is the **body-text** token, not a shade of the primary color. There is **no `accent` token** — use `primary-600`.

## Functional

| Role | Classes | Value |
|---|---|---|
| Success | `bg-success` / `text-success` | `oklch(0.65 0.18 145)` (green) |
| Warning | `bg-warning` / `text-warning` | `oklch(0.75 0.16 85)` (amber) |
| Error | `bg-error` / `text-error` | `oklch(0.62 0.24 25)` (red) |

## Category colors (quotes/goals)

Fixed hex per category (from `CATEGORY_COLORS`): inspiration `#8B5CF6`, learning `#3B82F6`, productivity `#10B981`, mindfulness `#06B6D4`, success `#F59E0B`, creativity `#EC4899`, resilience `#EF4444`, leadership `#6366F1`, health `#14B8A6`, growth `#84CC16`.

## Themes

Four color families, switched with `data-theme` on a wrapper; add class `dark` for dark mode (e.g. `<div class="dark" data-theme="forest">`):

- **purple** (default) — violet, the brand.
- **forest** — green (hue ~145).
- **rose** — pink (hue ~2–10).
- **glass** — neutral white/transparent frosted surfaces with white text, for image backgrounds; primary scale becomes white-with-alpha, surfaces become `rgba(0,0,0,.25–.35)`.

Each theme remaps the same token names, so building with tokens (not raw colors) makes a component work in all themes automatically.
