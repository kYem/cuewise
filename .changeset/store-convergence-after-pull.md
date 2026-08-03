---
'@cuewise/app': patch
---

Fix goals, quotes and reminders edited on one device being reverted on another. A page that was already open never learned that a sync pull had changed its data, so the next edit made there saved its own stale copy over what arrived — losing a completed task, a changed due date or an added subtask, in either direction. Open pages now pick up changes as they land.
