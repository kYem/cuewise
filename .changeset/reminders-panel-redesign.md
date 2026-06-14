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
  Up next / Scheduled), each row a category-icon node that doubles as the
  complete button.

Both layouts add a distinct "Needs response" state (the alarm fired and is
awaiting you), category accents, live countdowns, 12h/24h-aware times, and a
roomier layout — launched from the same bottom-right Alerts bell, with the same
Add / Edit / snooze / pause-resume actions, adapting to light/dark mode and all
four themes.

Also in this release:

- **Skip an upcoming occurrence.** Checking off a recurring reminder that has
  not fired yet skips that occurrence and advances to the next one — keeping a
  calendar reminder's clock time (tonight 9pm → tomorrow 9pm) — while checking
  off a due or overdue one restarts its cadence from now. The check control
  shows a skip glyph on hover when the click will skip.
- **Snooze from now**, not from the (possibly past) due date, so snoozing an
  overdue reminder no longer leaves it in the past.
- **Missed-alarm catch-up** on open, plus an in-page firing fallback when the
  alarms API is unavailable (dev server), so due reminders still surface.
- A single polished Add/Edit form shared across both flows.
- Write failures now surface an error instead of falsely reporting success.
