---
'@cuewise/storage': patch
---

Delete the duplicate copy of your settings that the per-key storage change left behind, on every device that still has one. It is no longer read on a settings load, and a device that has not finished the move now says so instead of quietly showing defaults and reading your synced data as empty.
