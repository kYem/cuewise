---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/sync-engine': patch
---

Cloud Sync now says what each round actually moved, at the Debug log level. Until now a sync that worked said nothing at all — only failures spoke — so there was no way to tell whether something had reached your other device or simply never left. It reports counts per kind of item and how far it got, never the contents of anything.

A change you make now reaches your other devices in seconds rather than minutes. Until now an edit waited for the next scheduled sync before it even left the device it was made on, and then waited again for the other device to ask — so a goal ticked off on one could take ten minutes to appear on the other. Edits are now sent shortly after you make them, and the Mac app checks for new ones whenever you switch back to it. An edit made while a sync was already running used to be dropped from the queue and never sent at all; it is now kept.
