# Brand

**CueWise** is a calm, violet-tinted mindful-productivity new-tab extension — motivational quotes, goals, focus timers, gentle reminders. The feel is **quiet, encouraging, momentum-building**: nothing shouty, plenty of breathing room.

## Identity at a glance

- **Color:** violet primary (`primary-600`), soft near-white surfaces, low-contrast borders. Theme families: purple (default), forest, rose, glass.
- **Type:** Inter for everything, Poppins for display headings.
- **Shape:** rounded — `rounded-xl` cards, `rounded-lg` controls, `rounded-full` pills.
- **Elevation:** light (`shadow-sm` cards, `shadow-lg` overlays). No heavy drop shadows.
- **Space:** generous and density-aware (`*-density-*`).

## Tone in copy

Short, warm, forward-looking. "Keep your momentum", "One task left", "Start 25-min session". Avoid pressure or guilt. Status reads as encouragement (`Badge variant="success"` "On track") rather than alarm.

## Glass theme

For image-backgrounded surfaces (the new-tab hero), the **glass** theme turns surfaces into frosted translucent panels (`rgba(0,0,0,.25–.35)`) with white text and white-alpha primaries — legible over any photo. Build with the same token classes; the theme does the rest.

## Putting it together

Lead with a token-styled `Card`, a `font-display`/`text-2xl` title, `text-secondary` supporting copy, a `primary` `Button` for the main action, and a `success`/`warning` `Badge` for status — generous `*-density-*` spacing throughout. See `colors`, `typography`, and `spacing` guidelines for the exact tokens.
