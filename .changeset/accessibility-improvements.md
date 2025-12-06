---
"@cuewise/browser-extension": minor
"@cuewise/ui": patch
---

Add accessibility improvements

- Semantic HTML landmarks (`<main>`, `<nav>`, `<header>`) for screen reader navigation
- Skip-to-main-content link for keyboard users
- `aria-live` regions for toast notifications and quote changes
- `prefers-reduced-motion` support to disable animations
- ARIA attributes for dropdown menus (`aria-expanded`, `aria-haspopup`, `role="menu"`)
- `aria-current="page"` for active navigation tabs
