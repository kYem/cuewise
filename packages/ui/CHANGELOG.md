# @cuewise/ui

## 1.25.1

### Patch Changes

- Updated dependencies [a2e35dc]
- Updated dependencies [9786286]
  - @cuewise/shared@1.25.1

## 1.25.0

### Patch Changes

- Updated dependencies [641ac48]
- Updated dependencies [67744a5]
  - @cuewise/shared@1.25.0

## 1.21.0

### Patch Changes

- Cloud Sync now tells you when it isn't working. A sync that fails no longer shows as active with a fresh "Last synced" time, and "Sync now" always reports what actually happened, on both the extension and the Mac app, instead of reporting success for a sync that didn't complete. When something goes wrong you'll see what kind of problem it is — offline, a problem on our side, or something on this device — with your account details and controls still available. A device that can't read its encryption key asks for your recovery code instead of saying your sign-in expired, and stops retrying a sync it cannot complete. When Cuewise can't tell you whether this device synced recently, it says so rather than showing nothing.

  Disconnecting Cloud Sync now stops a sync already in progress. Previously a sync that was mid-download kept writing the disconnected account's goals, quotes and settings onto this device, and could leave behind a bookmark that made the next connection silently skip everything before it. Connecting now always starts from a clean bookmark, so a reconnect can no longer inherit one from a different account. Disconnecting while Cloud Sync is still setting up undoes what setup had started, rather than finishing behind you and switching itself back on — and if it had already created your account, it still shows you the recovery code, which is the only way back into it.

- Fix several ways your data could quietly change behind you. Favouriting a quote could leave an older, unreadable copy of it behind, and that copy could then win on your other devices — the favourited version now replaces it everywhere. If moving your quote library to its new home was interrupted, retrying could overwrite quotes added since; the retry now merges instead, and if Cuewise cannot clear the old storage afterwards it empties it rather than leaving a copy that could bring back a quote you deleted. When Cuewise cannot read some cached calendar events, it refetches your agenda instead of showing the gaps as your real schedule for the rest of the day. A backup now includes quotes you only favourited or hid, which a "complete" export was leaving out.

  Importing a file that uses a category or session type this version does not recognise now tells you it was re-filed, rather than changing your data silently — and says so once per kind ("12 quotes had unrecognised categories…") instead of once per row, with the list capped at five and a count of the rest, so the Import button stays where you can reach it.

  Cuewise also checks its own saved data before showing it. If a note, goal or setting on your device ever ends up in a shape this version cannot read — after a downgrade, or a sync from a newer device — that one item is skipped instead of breaking the page, and a stored list containing a corrupt row no longer stops the whole list being read. Nothing else is touched, and anything a newer version added is left exactly as it was.

- Settings are now stored one at a time rather than as a single record. Changing a setting on one device can no longer overwrite a change arriving from another, and settings you have never touched follow Cuewise's defaults, so improvements to those defaults reach you instead of being frozen at whatever they were when you first changed something. Turning on cloud sync is the exception: it uploads your settings in full so every device starts from the same place, which fixes them at their current values from then on.

  This also fixes settings that could silently revert. Changing two settings in quick succession — nudging a slider while flipping a toggle — could quietly undo the first change, in the moment and on disk. Quote filter preferences were saved by a separate path that never reached cloud sync, so they stayed on one device; they now sync like every other preference. Settings survive a change arriving from another device mid-edit, and a setting changed on another device now appears straight away — the open page used to keep showing the old values until you changed something else or reloaded, so a theme you picked on your laptop looked like it hadn't arrived. If storage is full, saving a setting says so instead of appearing to succeed.

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @cuewise/shared@1.21.0

## 1.20.0

### Minor Changes

- b96a7ae: See the weather on your new tab — current conditions and the rest of today's forecast, from a city you pick yourself. Off until you turn it on, no location permission ever requested, and requests go through Cuewise's own proxy so your browser never talks to a weather company.

### Patch Changes

- Updated dependencies [b96a7ae]
  - @cuewise/shared@1.20.0

## 1.19.0

### Patch Changes

- d5cd0b3: Fix a new tab that could stay stuck on "Brewing your view…" indefinitely when the background image host was slow or blocked. The page now appears promptly and the photo fades in when it arrives.
- Updated dependencies [62e6a93]
- Updated dependencies [d5cd0b3]
  - @cuewise/shared@1.19.0

## 1.18.0

### Minor Changes

- Optional Cloud Sync is now available: sign in to sync your goals, quotes, reminders, and settings across devices. Your data is end-to-end encrypted on your device before it leaves — the server only ever stores ciphertext it cannot read. Off by default; Cuewise stays fully local until you turn it on.

### Patch Changes

- 0559dd2: Credit the Unsplash photo behind the glass theme and add a "New background" control to swap it without waiting for tomorrow
- 328ff4a: Use your own picture as the background — stored on your device, never uploaded.
- Updated dependencies [0559dd2]
- Updated dependencies
- Updated dependencies [328ff4a]
  - @cuewise/shared@1.18.0

## 1.17.1

### Patch Changes

- Updated dependencies
  - @cuewise/shared@1.17.1

## 1.17.0

### Patch Changes

- Updated dependencies [374d7a8]
  - @cuewise/shared@1.17.0

## 1.16.0

### Patch Changes

- c81b692: fix(ui): make Popover/dropdown content legible on the glass theme. The shared PopoverContent used a translucent `bg-surface` with no backdrop blur, so on the glass theme menu items (e.g. the calendar Disconnect menu) were see-through and content behind them bled through. It now uses `bg-surface-elevated` with `backdrop-blur-xl`, matching the app's other floating panels.

## 1.15.0

### Patch Changes

- Updated dependencies [d08c969]
- Updated dependencies [267717b]
  - @cuewise/shared@1.15.0

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
