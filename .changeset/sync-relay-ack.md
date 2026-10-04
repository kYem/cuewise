---
'@cuewise/browser-extension': patch
---

Cloud sync retries an edit until the background has recorded it, so a failed save no longer leaves it unsynced.
