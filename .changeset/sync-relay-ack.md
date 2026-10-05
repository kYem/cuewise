---
'@cuewise/browser-extension': patch
'@cuewise/api': patch
'@cuewise/sync-engine': patch
'@cuewise/sync-client': patch
'@cuewise/macos': patch
---

Cloud sync retries an edit until the background has recorded it, so a failed save no longer leaves it unsynced. An account at its record limit can still edit and delete what it has, and a failed storage read no longer signs you out.
