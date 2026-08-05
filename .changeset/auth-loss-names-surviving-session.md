---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/sync-engine': patch
'@cuewise/sync-client': patch
---

Say so when Cloud Sync loses its authorisation but cannot clear the stored sign-in. Until now that left the app believing it was still signed in to an account it had just lost access to, with nothing in the log to explain it.
