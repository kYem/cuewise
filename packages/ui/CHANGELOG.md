# @cuewise/ui

## 1.14.0

### Patch Changes

- Updated dependencies [36db2a1]
- Updated dependencies [94c3c9b]
- Updated dependencies [94c3c9b]
- Updated dependencies [9ba7be9]
  - @cuewise/shared@1.14.0

## 1.13.0

### Patch Changes

- Updated dependencies [e7fd59b]
  - @cuewise/shared@1.13.0

## 1.9.1

### Patch Changes

- Updated dependencies [b6719ff]
  - @cuewise/shared@1.9.1

## 1.9.0

### Patch Changes

- Updated dependencies [a403b84]
- Updated dependencies [c8b9d8c]
- Updated dependencies [541153e]
- Updated dependencies [04e9997]
- Updated dependencies [6eddbc7]
  - @cuewise/shared@1.9.0

## 1.8.0

### Patch Changes

- Updated dependencies [ea2b22f]
- Updated dependencies [0c8b323]
- Updated dependencies [e2f24c1]
  - @cuewise/shared@1.8.0

## 1.6.0

### Minor Changes

- d5ebdd6: Add author autocomplete and streamline quote management
  - Add reusable Autocomplete component to @cuewise/ui with keyboard navigation and accessibility support
  - Add author autocomplete to Add Quote and Edit Quote forms, suggesting existing authors
  - Remove floating "Add Custom Quote" button from home page - quotes can now be added via the dedicated Quote Management page

## 1.4.0

### Patch Changes

- b02da15: Add accessibility improvements
  - Semantic HTML landmarks (`<main>`, `<nav>`, `<header>`) for screen reader navigation
  - Skip-to-main-content link for keyboard users
  - `aria-live` regions for toast notifications and quote changes
  - `prefers-reduced-motion` support to disable animations
  - ARIA attributes for dropdown menus (`aria-expanded`, `aria-haspopup`, `role="menu"`)
  - `aria-current="page"` for active navigation tabs

- 9ac8b71: Improve charts with shadcn/Recharts best practices
  - Add CSS variable injection for theme-aware chart colors
  - Fix tooltip styling for dark mode compatibility
  - Add `hideName` prop to ChartTooltipContent for cleaner tooltips
  - Remove dashed grid lines, use clean horizontal lines
  - Make X-axis labels horizontal and abbreviated
  - Convert weekday chart to vertical bar layout for consistency
  - Add forest and rose theme chart color variants
