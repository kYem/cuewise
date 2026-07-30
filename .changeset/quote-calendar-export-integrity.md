---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
---

Fix four ways your data could quietly change behind you. Favouriting a quote could leave an older, unreadable copy of it behind, and that copy could then win on your other devices — the favourited version now replaces it everywhere. If moving your quote library to its new home was interrupted, retrying could overwrite quotes added since; the retry now merges instead. When Cuewise cannot read some cached calendar events, it now refetches your agenda instead of showing the gaps as your real schedule for the rest of the day. A backup now includes quotes you only favourited or hid, which a "complete" export was leaving out. Importing a file that uses a category or session type this version does not recognise now tells you it was re-filed, rather than changing your data silently.
