---
'@cuewise/browser-extension': minor
'@cuewise/shared': minor
---

feat(new tab): show the calendar in the goals area via the View Mode menu

The home new-tab "Today's Focus" area can now show the Google Calendar "Up next"
strip instead of goals, chosen from the existing View Mode menu (Full / Compact /
Focus / Calendar). The Calendar entry only appears when the integration is
provisioned; an un-provisioned build always falls back to goals.

- new `newTabPrimary` setting (`goals | calendar | both`, default `goals`);
  `goalViewMode` stays purely goals density
- a **Both** menu entry stacks goals + calendar, with a `newTabCalendarPosition`
  (`above | below`, default `below`) control to order the calendar relative to
  goals
- `GoalsSection` composes independent goals/calendar blocks ordered by position
- reuses the existing `CalendarStrip` + calendar store; lazy-inits calendar only
  when the calendar block is shown
- `CalendarStrip` gains a `variant`: the home page uses a theme-token `surface`
  variant (readable on light themes), while the Pomodoro companion keeps the
  white-on-dark `overlay` look on its image background
