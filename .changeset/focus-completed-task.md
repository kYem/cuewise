---
"@cuewise/browser-extension": patch
---

Fix focus mode lingering on a completed task

Focus mode now shows the "All done" screen once every task is complete, and
advances to the next open task — even when the focused task was completed from
another view. Previously a now-completed focused task stayed on screen
(struck-through) instead of advancing or celebrating.
