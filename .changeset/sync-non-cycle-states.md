---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
'@cuewise/ui': patch
---

Cloud Sync now explains the problems it used to hide. A device whose encryption key has gone missing asks for your recovery code instead of saying your sign-in expired, and stops retrying a sync it cannot complete. When Cloud Sync can't tell you whether this device synced recently, it says so rather than showing nothing.
