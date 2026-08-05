---
'@cuewise/browser-extension': minor
'@cuewise/macos': minor
'@cuewise/app': minor
'@cuewise/sync-engine': patch
---

Cloud Sync now says what each round actually moved, at the Debug log level. Until now a sync that worked said nothing at all — only failures spoke — so there was no way to tell whether something had reached your other device or simply never left. It reports counts per kind of item and how far it got, never the contents of anything.

The quick menu now tells you where sync stands without going anywhere: the account you are signed in as, when it last synced, and a control to sync now. Answering "did that save?" used to mean opening Settings and finding Cloud Sync in the nav. If sync needs your attention — an expired sign-in, a missing recovery code — the line says so and takes you to the one place that can fix it.
