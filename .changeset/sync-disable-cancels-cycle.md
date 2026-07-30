---
'@cuewise/browser-extension': patch
'@cuewise/macos': patch
'@cuewise/app': patch
'@cuewise/shared': patch
'@cuewise/storage': patch
'@cuewise/ui': patch
---

Disconnecting Cloud Sync now stops a sync already in progress. Previously a sync that was mid-download kept writing the disconnected account's goals, quotes and settings onto this device, and could leave behind a bookmark that made the next connection silently skip everything before it. Connecting Cloud Sync now always starts from a clean bookmark, so a reconnect can no longer inherit one from a different account.
