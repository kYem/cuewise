---
"@cuewise/browser-extension": minor
---

Redesign the Today's Focus goals widget (full + compact) from the design handoff

- Full mode now leads with a progress ring + encouragement line, with the
  add-a-goal input moved to the bottom of the card
- A single ⚙ menu consolidates the view-mode switcher (Full / Compact / Focus)
  and a new "Show completed" filter, replacing the header trio and footer buttons
- Compact rows show a per-goal subtask progress bar and count
- New `showCompletedGoals` setting (default on) hides finished tasks from the list
- Removed the standalone progress bar and "Clear completed" button — the ring and
  the show-completed filter cover them
