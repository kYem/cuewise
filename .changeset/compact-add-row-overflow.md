---
"@cuewise/browser-extension": patch
---

Fix the compact "Today's Focus" widget: add-row overflow, dead empty state, and
inert menu toggles

- The compact add-row rendered the boxed input variant, whose `min-w-[280px]`
  plus the wide Add button overflowed the 400px card — truncating the placeholder
  and clipping the "Add" button off the right edge. It now uses the soft-pill
  `widget` variant that fits.
- Completing every task with "Show completed" off left a dead widget with no way
  to add a task (the add-row only appeared when there were literally zero tasks).
  The add-row now shows whenever the visible list is empty.
- The compact menu's "Show incomplete" and "Upcoming" toggles did nothing — those
  sections were full-mode only. They now render in compact too, so the toggles
  are meaningful in both views.
