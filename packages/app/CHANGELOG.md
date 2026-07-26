# @cuewise/app

## 1.18.0

### Minor Changes

- b96a7ae: See the weather on your new tab — current conditions and the rest of today's forecast, from a city you pick yourself. Off until you turn it on, no location permission ever requested, and requests go through Cuewise's own proxy so your browser never talks to a weather company.

### Patch Changes

- Updated dependencies [b96a7ae]
  - @cuewise/shared@1.20.0
  - @cuewise/storage@1.20.0
  - @cuewise/ui@1.20.0

## 1.17.0

### Minor Changes

- Background overhaul release: instant new-tab reveal even when the photo CDN stalls, dim/blur readability sliders, a near-doubled wallpaper collection with verified photographer credits, and a location-first credit line.

### Patch Changes

- 00997df: Keep the photo credit and its "new background" button on the home and Pomodoro pages, where the background is the point. Goals, Quotes, Insights and Concepts no longer have it sitting over their content in the bottom-left corner.
- 62e6a93: Dim and blur sliders for the background image, so your quote and goals stay readable over any photo — including your own.
- ad4039b: The background credit now leads with where the photo was taken ("Ciucaș Peak, Romania"), with the photographer credit revealed on hover or keyboard focus; photos without a place tag keep the visible byline.
- a89fed0: Nearly double the background wallpaper collection (115 photos, 15–20 per category), every one now crediting its photographer by name — plus removal of two dead images and one miscategorized photo that had been shipping broken.
- Updated dependencies [62e6a93]
- Updated dependencies [d5cd0b3]
  - @cuewise/shared@1.19.0
  - @cuewise/storage@1.19.0
  - @cuewise/ui@1.19.0

## 1.16.2

### Patch Changes

- Updated dependencies [0559dd2]
- Updated dependencies
- Updated dependencies [328ff4a]
  - @cuewise/shared@1.18.0
  - @cuewise/storage@1.18.0
  - @cuewise/ui@1.18.0

## 1.16.1

### Patch Changes

- Updated dependencies
  - @cuewise/shared@1.17.1
  - @cuewise/storage@1.17.1
  - @cuewise/ui@1.17.1

## 1.16.0

### Minor Changes

- 374d7a8: Tasks now roll into Today automatically when their due date arrives. Incomplete tasks whose deadline is today or earlier move into the Today list on load and at midnight (including when the machine wakes past midnight), instead of waiting for a manual transfer (tasks you've deliberately scheduled for a future day stay put). A new "Auto-roll due tasks" toggle in goal settings turns it off; manual transfer counts are unaffected.

### Patch Changes

- e83d0b1: Goal edits and data imports now surface storage write failures instead of silently reverting. When a write fails (e.g. storage quota), editing, linking, adding, deleting, transferring, or re-dating a task shows an error toast and keeps the previous state, rather than displaying a change that would vanish on the next reload. Imports no longer report "Successfully imported" when the write never landed — a quota failure now shows the storage-full message and honest partial counts.
- Updated dependencies [374d7a8]
- Updated dependencies [2169ac2]
  - @cuewise/shared@1.17.0
  - @cuewise/storage@1.17.0
  - @cuewise/ui@1.17.0

## 1.15.1

### Patch Changes

- Updated dependencies [c81b692]
  - @cuewise/ui@1.16.0
