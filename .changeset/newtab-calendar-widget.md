---
'@cuewise/browser-extension': minor
'@cuewise/shared': minor
---

feat(new tab): show the calendar alongside goals via a toggle

The home new-tab "Today's Focus" menu gains a **Calendar** toggle: goals always
show (with their Full / Compact / Focus density), and turning the toggle on
stacks the Google Calendar "Up next" strip above or below them. The toggle only
appears when the integration is provisioned.

- new `newTabShowCalendar` boolean setting (default off); `goalViewMode` stays
  purely goals density
- a `newTabCalendarPosition` (`above | below`, default `below`) control — an
  up/down arrow on the same toggle row — orders the calendar when it's on
- `GoalsSection` stacks the goals + calendar blocks ordered by position
- reuses the existing `CalendarStrip` + calendar store; lazy-inits calendar only
  when the calendar block is shown
- `CalendarStrip` gains a `variant`: the home page uses a theme-token `surface`
  variant (readable on light themes), while the Pomodoro companion keeps the
  white-on-dark `overlay` look on its image background
