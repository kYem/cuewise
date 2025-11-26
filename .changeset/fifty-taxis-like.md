---
"@cuewise/browser-extension": patch
---

Fix pomodoro timer display getting stuck on navigation

When navigating to the Pomodoro page while the timer was actively running, the display would appear stuck showing stale time. The fix detects when the timer is actively being ticked by another component and skips unnecessary state recovery.
