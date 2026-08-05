---
'@cuewise/browser-extension': minor
'@cuewise/macos': minor
'@cuewise/app': minor
'@cuewise/sync-engine': minor
---

Cloud Sync now says what each round actually moved, at the Debug log level. Until now a sync that worked said nothing at all — only failures spoke — so there was no way to tell whether something had reached your other device or simply never left. It reports counts per kind of item and how far it got, never the contents of anything. The sync settings panel also stops jumping while it loads: the account line used to appear from nothing, nudging the buttons beneath it down just as you reached for one.

A change you make now reaches your other devices in seconds rather than minutes. Until now an edit waited for the next scheduled sync before it even left the device it was made on, and then waited again for the other device to ask — so a goal ticked off on one could take ten minutes to appear on the other. Edits are now sent shortly after you make them, and the Mac app checks for new ones whenever you switch back to it. An edit made while a sync was already running used to be dropped from the queue and never sent at all; it is now kept.

The quick menu now tells you where sync stands without going anywhere: the account you are signed in as, when it last synced, and a control to sync now. Answering "did that save?" used to mean opening Settings and finding Cloud Sync in the nav. If sync needs your attention — an expired sign-in, a missing recovery code — the line says so and takes you to the one place that can fix it.
