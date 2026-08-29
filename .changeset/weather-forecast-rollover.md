---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/api': patch
---

The weather popover's hourly strip now rolls into tomorrow instead of emptying out at the end of the day. A window left open now refreshes the reading itself, rather than keeping the one it started with. The calendar strip also recovers when its last-sync time is unreadable, instead of never refreshing again.
