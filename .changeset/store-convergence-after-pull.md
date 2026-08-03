---
'@cuewise/app': patch
'@cuewise/storage': patch
---

Fix goals, quotes and reminders edited on one device being reverted on another. A page that was already open never learned that a sync pull had changed its data, so the next edit made there saved its own stale copy over what arrived — losing a completed task, a changed due date or an added subtask, in either direction. Open pages now pick up changes as they land.

Also stop a goal, reminder or collection list that cannot be read from being reported as an empty one. Those lists are saved back whole, so a read that failed mid-session could turn into an empty list being saved over real data and synced everywhere. A failed read is now refused, the way quotes already were.
