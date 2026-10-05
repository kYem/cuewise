---
'@cuewise/browser-extension': patch
'@cuewise/api': patch
---

Cloud sync retries an edit until the background has recorded it, so a failed save no longer leaves it unsynced. An account at its record limit can still edit and delete what it has.
