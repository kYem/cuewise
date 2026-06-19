# Typography

Two families, both loaded at runtime (Google Fonts):

| Token | Family | Use |
|---|---|---|
| `font-sans` | **Inter** (weights 300–700) | body, UI, the default everywhere |
| `font-display` | **Poppins** (weights 600–800) | display headings, hero numbers |

Body text defaults to Inter via the base layer; reach for `font-display` on large headings to set the calm, rounded brand tone.

## Type scale

Standard Tailwind sizes are used; common steps:

| Class | Size | Typical use |
|---|---|---|
| `text-xs` | 12px | meta, counts, badges |
| `text-sm` | 14px | secondary copy, labels |
| `text-base` | 16px | body |
| `text-lg` | 18px | emphasised body, small headings |
| `text-xl` | 20px | section headings |
| `text-2xl` | 24px | card titles (`CardTitle`) |

Weights in use: `font-medium` (labels, buttons), `font-semibold` (titles). Pair size with the text-color tokens — `text-primary` for headings/body, `text-secondary`/`text-tertiary` for supporting copy.

## Density

The base font size scales with `data-density` (`--font-scale`): compact `0.875×` (14px base), comfortable `1×` (16px), spacious `1.125×` (18px). Use relative sizing so type respects the user's density choice.
