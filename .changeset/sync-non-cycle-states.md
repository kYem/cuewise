---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
'@cuewise/ui': patch
---

Cloud Sync now explains the problems it used to hide. A device that can't read its encryption key asks for your recovery code instead of saying your sign-in expired, and stops retrying a sync it cannot complete. When Cloud Sync can't tell you whether this device synced recently, it says so rather than showing nothing. And pressing "Sync now" always reports what happened, on both the extension and the Mac app.
