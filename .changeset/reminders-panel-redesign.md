---
"@cuewise/browser-extension": minor
---

Redesign the reminders panel with two selectable layouts, replacing the cramped
single-panel view. A new "Reminders layout" setting (Settings → Goals & alerts)
switches between:

- **Composed** (default) — an ambient habits strip for interval reminders
  (tap to mark done) plus a scheduled timeline, with the one consequential
  overdue item shown as a "Needs response" hero card.
- **Agenda** — a single time rail grouped by urgency (Needs response / Overdue /
  Up next / Later today), each row a category-icon node that doubles as the
  complete button.

Both add a distinct "Needs response" state (the alarm fired and is awaiting you),
category accents, live countdowns, and a roomier layout — launched from the same
bottom-right Alerts bell, with the same Add / Edit / snooze / pause-resume
actions. The panels adapt to light/dark mode and all four themes.
