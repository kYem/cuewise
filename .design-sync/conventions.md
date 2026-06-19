# CueWise UI — how to build with this library

CueWise is a calm, violet-tinted mindful-productivity new-tab extension. Components are React, styled with **Tailwind v4 utility classes plus a set of semantic design tokens**. Import every component from `@cuewise/ui`.

## Setup & theming (no provider needed)

There is **no React provider** — tokens are plain CSS custom properties on `:root`, so just load the design system's `styles.css` and components are styled. The default theme is **purple, light**.

Switch themes by setting attributes on a wrapping element (or `<html>`):

- `data-theme="purple" | "forest" | "rose" | "glass"` — color family. `glass` is for image backgrounds (transparent frosted surfaces, white text).
- add class `dark` for dark mode (e.g. `<div class="dark" data-theme="forest">`).
- `data-density="compact" | "comfortable" | "spacious"` — drives the `*-density-*` spacing utilities and base font size.

```jsx
<div data-theme="purple"> {/* default; omit for purple-light */}
  <App />
</div>
```

## Styling idiom — use these token classes, not raw colors

Prefer the semantic token utilities below over Tailwind's built-in palette so the UI re-themes correctly. The primary (brand violet) scale is `50–900`.

| Need | Classes |
|---|---|
| Brand color | `bg-primary-600` (hover `bg-primary-700`), `text-primary-600`, `border-primary-500`, scale `*-primary-50 … *-primary-900` |
| Surfaces | `bg-background`, `bg-surface`, `bg-surface-elevated`, `bg-surface-variant` |
| Text | `text-primary` (main), `text-secondary`, `text-tertiary` — note `text-primary` is the body text token, **not** a primary-color shade |
| Borders | `border-border`, `border-divider` |
| Status | `bg-success` / `text-success`, `bg-warning` / `text-warning`, `bg-error` / `text-error` |
| Fonts | `font-sans` (Inter, body), `font-display` (Poppins, headings) |
| Density spacing | `p-density-md`, `px-density-lg`, `py-density-sm`, `gap-density-sm`, `space-y-density-md`, `mb-density-lg`, `mt-density-xs` … |

**There is no `accent` token** — `bg-accent` / `text-accent` do not exist and render unstyled. Use `primary-600` for accents.

## Where the truth lives

- `styles.css` (and its `@import "./_ds_bundle.css"`) is the full compiled stylesheet — read it for the exact token values and every available utility.
- Each component has a `<Name>.d.ts` (its prop contract) and `<Name>.prompt.md` (usage) under `components/general/<Name>/`.

## Components

Primitives: `Button` (variant `primary`/`secondary`/`outline`/`ghost`, size `sm`/`md`/`lg`), `Badge` (variant `default`/`primary`/`secondary`/`success`/`warning`/`danger`), `Input`, `Textarea` (`showCount`+`maxLength`), `Label` (`required`). Composition: `Card` + `CardHeader`/`CardTitle`/`CardContent`. Controlled inputs: `Select` (`value`/`onChange`/`options`), `Autocomplete` (`suggestions`). Overlay: `Popover` + `PopoverTrigger`/`PopoverContent`. Feedback: `ToastContainer` (`toasts`/`onClose`). Charts: `ChartContainer` (recharts wrapper) + `ChartTooltip`/`ChartTooltipContent`/`ChartLegend`/`ChartLegendContent`. Utility: `cn(...)` for conditional class merging.

## Idiomatic example

```jsx
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@cuewise/ui';

<Card className="max-w-sm">
  <CardHeader>
    <div className="flex items-center justify-between">
      <CardTitle className="text-lg">Today's Focus</CardTitle>
      <Badge variant="success">On track</Badge>
    </div>
    <p className="text-secondary text-sm">One task left — keep your momentum.</p>
  </CardHeader>
  <CardContent className="mt-4">
    <Button variant="primary">Start 25-min session</Button>
  </CardContent>
</Card>
```
