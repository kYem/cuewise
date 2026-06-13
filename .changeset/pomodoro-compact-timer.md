---
"@cuewise/browser-extension": minor
---

Redesign the Pomodoro timer into a compact, on-brand card with a goal-picker header

- **Compact card** — smaller ring, digits, and controls, with a density-aware
  width (compact / comfortable / spacious)
- **The header is the goal picker** — the title shows the chosen goal or the
  session label ("Focus Session"); a chevron opens a dropdown of today's
  incomplete goals with an in-list "Clear goal" option, and it closes on
  click-outside. A long goal title shrinks to fit two lines, then fades at the
  bottom edge instead of hard-truncating
- **Settings as a compact icon row** — ⏱ focus · ☕ break · 🛏 long break ·
  ↻ interval; each value opens its preset menu in a single click (no more bulky
  inline select), and the active-sound line uses a Lucide icon instead of an emoji
- The "until long break" session dots now sit just below the ring
