---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/sync-engine': patch
---

Say so when a Cloud Sync account has no recovery code. Until now a device in that state synced normally and showed nothing — but losing it would have lost the data, and the next device you connected would have started its own separate key that neither could read from the other. The Cloud Sync panel now points you at Regenerate, which is the fix.
