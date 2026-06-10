---
name: cuewise-design
description: Use this skill to generate well-branded interfaces and assets for Cuewise (a calm, violet-tinted mindful-productivity new-tab extension), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI-kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

- **Foundations:** `styles.css` (link this) → `tokens/` (colors, typography, spacing, fonts, base). Colors are OKLCH; the brand is a single **violet primary** over near-white neutrals on a soft gradient. Four themes (Purple default, Forest, Rose, Glass) + dark mode + density scales.
- **Type:** Poppins (display/clock/quotes) + Inter (body). Loaded from Google Fonts via `tokens/fonts.css`.
- **Components:** `components/core/` — Button, IconButton, CategoryBadge, Card, Toggle, StatCard (each with `.jsx`, `.d.ts`, `.prompt.md`).
- **UI kits:** `ui_kits/new-tab`, `/pomodoro`, `/insights`, `/quotes` — full-screen recreations; `ui_kits/_lib/icons.jsx` is the shared Lucide icon helper.
- **Icons:** Lucide (2px outline). Emoji only as sparse warmth accents.
- **Voice:** warm, calm coach; second person; Title Case headings, sentence-case helper text.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and create static HTML files for the user to view. If working on production code, copy assets and read the rules here to design as an expert in this brand.

If the user invokes this skill without other guidance, ask what they want to build, ask a few questions, and act as an expert designer who outputs HTML artifacts _or_ production code depending on the need.
