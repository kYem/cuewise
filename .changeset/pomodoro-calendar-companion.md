---
'@cuewise/browser-extension': minor
'@cuewise/shared': minor
'@cuewise/storage': minor
---

feat(pomodoro): google calendar "up next" companion (ENG-13)

Beside the Pomodoro timer you can now show a quote, a Google Calendar agenda, or
both, chosen via a Quote/Calendar/Both control in Timer settings.

- new `pomodoroCompanion` setting (quote | calendar | both, default quote)
- `CalendarStrip` with connect / loading / empty / event-list states + a lean
  "Up next" mode for the stacked Calendar + Quote layout
- read-only Google Calendar sync via `chrome.identity` + the Calendar API
  (`calendar.readonly`), entirely client-side — no Cuewise backend involved
- ships safely un-provisioned: the dev server shows sample data, and a
  production build without an OAuth client id reports the calendar isn't set up
  rather than fabricating events

Setup for the OAuth client id is documented in
`apps/browser-extension/GOOGLE_CALENDAR.md`.
