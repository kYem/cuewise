---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/api': patch
---

The weather popover's hourly strip now rolls into tomorrow instead of emptying out at the end of the day, and a window left open refreshes itself rather than keeping the reading it started with. A reading whose age can no longer be trusted says so and refreshes, instead of claiming it was updated just now — as does the calendar strip when its own last-sync time is unreadable.
