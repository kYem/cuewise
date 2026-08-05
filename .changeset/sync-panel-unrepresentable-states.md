---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
---

Stop the Cloud Sync panel going blank when it meets a sign-in state it doesn't recognise — one written by a newer or older version of the app. The switch used to read on above an empty panel with no way to act; it now works out whether sync is enabled and shows that instead.
