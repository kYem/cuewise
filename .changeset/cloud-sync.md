---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/sync-engine': patch
---

Cloud Sync now says what each round actually moved, at the Debug log level. Until now a sync that worked said nothing at all — only failures spoke — so there was no way to tell whether something had reached your other device or simply never left. It reports counts per kind of item and how far it got, never the contents of anything. The sync settings panel also stops jumping while it loads: the account line used to appear from nothing, nudging the buttons beneath it down just as you reached for one.
