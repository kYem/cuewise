---
"@cuewise/browser-extension": minor
---

Redesign the Today's Focus goals widget to match the design system (full, compact, and focus views)

- **Full view** leads with a progress ring + encouragement line; soft pill rows
  with the subtask `n/m` count on the right that expands the subtasks inline; the
  add-a-goal input moved to the bottom of the card
- **Compact view** is now slim glanceable rows: flag/check pill, an inline subtask
  progress bar, and an accordion chevron
- A single ⚙ menu consolidates the view-mode switcher (Full / Compact / Focus) and
  the **Show completed / Show incomplete / Upcoming** toggles, replacing the old
  header trio and in-card buttons
- Subtask management (add / remove / reorder) is edit-mode only; the drag handle
  appears only while editing
- New persisted settings — `showCompletedGoals` (default on), `showIncompleteGoals`,
  and `showUpcomingGoals` — so the toggles survive reload
- Removed the standalone progress bar and the "Clear completed" button (the ring
  and the show-completed filter cover them)
