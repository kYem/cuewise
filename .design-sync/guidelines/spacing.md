# Spacing, radii & elevation

## Density-aware spacing

CueWise spacing responds to the user's layout density (`data-density` = `compact` | `comfortable` | `spacious`). Use the **`*-density-*` utilities** for layout padding/gaps so they track that choice, rather than fixed `p-4`-style values for container rhythm.

| Token | compact | comfortable | spacious |
|---|---|---|---|
| `--spacing-xs` | 6px | 8px | 10px |
| `--spacing-sm` | 8px | 12px | 16px |
| `--spacing-md` | 12px | 16px | 20px |
| `--spacing-lg` | 16px | 24px | 32px |
| `--spacing-xl` | 24px | 32px | 40px |
| `--spacing-2xl` | 32px | 48px | 64px |

Utilities: `p-density-{xs..2xl}`, `px-density-{sm,md,lg}`, `py-density-{sm,md,lg}`, `gap-density-{xs..lg}`, `space-y-density-{sm..xl}`, `mb-density-{xs..2xl}`, `mt-density-{xs..2xl}`. Fixed Tailwind spacing is fine for small intra-component gaps.

## Radii

Rounded, soft corners are core to the calm feel:

- `rounded-lg` (8px) — buttons, inputs, list rows, popovers.
- `rounded-xl` (12px) — cards.
- `rounded-full` — badges, pills, avatars, toggles.

## Elevation (shadow)

Subtle shadows only:

- `shadow-sm` — resting cards.
- `shadow-lg` — popovers, dropdowns, toasts.
- `shadow-xl` — elevated/floating panels (open menus, chart tooltips).
